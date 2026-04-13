"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { buildPaymentProofMessage, type AiModel, type InferenceResult, type PaymentProof, type PaymentResult } from "@axon/shared";

const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://127.0.0.1:8080";
const x402Token = process.env.NEXT_PUBLIC_X402_TOKEN ?? "";
const stellarExplorerBase = "https://stellar.expert/explorer/testnet/tx/";
const stellarExplorerSearchBase = "https://stellar.expert/explorer/testnet/search?text=";
const paymentRouterContractId = process.env.NEXT_PUBLIC_PAYMENT_ROUTER_CONTRACT_ID ?? "";
const enableTxStatusLookup = process.env.NEXT_PUBLIC_ENABLE_TX_STATUS_LOOKUP !== "false";
const requireWalletForPayment = process.env.NEXT_PUBLIC_REQUIRE_WALLET === "true";
const requireWalletSignature = process.env.NEXT_PUBLIC_REQUIRE_WALLET_SIGNATURE === "true";
const txStatusPollIntervalMs = Number(process.env.NEXT_PUBLIC_TX_STATUS_POLL_INTERVAL_MS ?? 2500);
const txStatusMaxPollAttempts = Number(process.env.NEXT_PUBLIC_TX_STATUS_MAX_POLLS ?? 6);
const walletRequestTimeoutMs = Number(process.env.NEXT_PUBLIC_WALLET_REQUEST_TIMEOUT_MS ?? 8000);

type TxState = "submitted" | "confirmed" | "failed" | "local";

type TxMeta = {
  createdAtMs: number;
  updatedAtMs: number;
};

type WalletBridge = {
  requestAccess?: () => Promise<unknown>;
  getPublicKey?: () => Promise<string>;
  getAddress?: () => Promise<unknown>;
  signMessage?: (
    message: string | { message: string; address?: string },
    options?: { address?: string }
  ) => Promise<unknown>;
};

type WalletSignState = "unknown" | "wallet-signed" | "wallet-missing" | "wallet-unsupported";

type PaymentCapabilities = {
  settlementBackendAvailable: boolean;
  enableSorobanSettlement?: boolean;
  enableFacilitatorSettlement?: boolean;
  enableLocalSettlementSimulation?: boolean;
  mode?: string;
  reason?: string;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function normalizeWalletSignature(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value instanceof Uint8Array) {
    return toBase64(value);
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const objectValue = value as Record<string, unknown>;
  const candidates = [
    objectValue.signature,
    objectValue.signedMessage,
    objectValue.signedData,
    objectValue.signatureBase64,
    objectValue.data
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }

    if (candidate instanceof Uint8Array) {
      return toBase64(candidate);
    }
  }

  return "";
}

function normalizeWalletAddress(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const objectValue = value as Record<string, unknown>;
  const candidates = [objectValue.address, objectValue.publicKey];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function resolveWalletBridge(): WalletBridge | null {
  type BrowserWithBridge = Window & {
    freighterApi?: WalletBridge;
    freighter?: WalletBridge | { api?: WalletBridge };
  };

  if (typeof window === "undefined") {
    return null;
  }

  const browserWindow = window as BrowserWithBridge;
  if (browserWindow.freighterApi) {
    return browserWindow.freighterApi;
  }

  if (browserWindow.freighter && "api" in browserWindow.freighter) {
    const maybeApi = browserWindow.freighter.api;
    if (maybeApi) {
      return maybeApi;
    }
  }

  if (browserWindow.freighter && typeof browserWindow.freighter === "object") {
    return browserWindow.freighter as WalletBridge;
  }

  return null;
}

async function resolveWalletBridgeWithFallback(): Promise<WalletBridge | null> {
  const injectedBridge = resolveWalletBridge();
  if (injectedBridge) {
    return injectedBridge;
  }

  try {
    const freighterModule = (await import("@stellar/freighter-api")) as Record<string, unknown>;

    const requestAccess =
      typeof freighterModule.requestAccess === "function"
        ? async () => await (freighterModule.requestAccess as () => Promise<unknown>)()
        : undefined;

    const getPublicKey =
      typeof freighterModule.getPublicKey === "function"
        ? async () => await (freighterModule.getPublicKey as () => Promise<string>)()
        : undefined;

    const getAddress =
      typeof freighterModule.getAddress === "function"
        ? async () => await (freighterModule.getAddress as () => Promise<unknown>)()
        : undefined;

    const signMessage =
      typeof freighterModule.signMessage === "function"
        ? async (
            message: string | { message: string; address?: string },
            options?: { address?: string }
          ) => {
            const messageText = typeof message === "string" ? message : message.message;
            const address = (typeof message === "object" ? message.address : undefined) ?? options?.address;
            const signer = freighterModule.signMessage as (msg: string, opts?: { address?: string }) => Promise<unknown>;
            return await signer(messageText, address ? { address } : undefined);
          }
        : undefined;

    if (!requestAccess && !getPublicKey && !getAddress && !signMessage) {
      return null;
    }

    return {
      requestAccess,
      getPublicKey,
      getAddress,
      signMessage
    };
  } catch {
    return null;
  }
}

function buildX402HeaderValue(paymentProof: PaymentProof | undefined): string {
  if (!paymentProof) {
    return "";
  }

  const encoded = new TextEncoder().encode(JSON.stringify(paymentProof));
  return toBase64(encoded);
}

function isValidStellarPublicKey(value: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(value);
}

function isOnChainTxHash(value: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(value);
}

function shortTxHash(value: string): string {
  if (value.length <= 16) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function getTxStateLabel(state: TxState): string {
  if (state === "submitted") return "Submitted";
  if (state === "confirmed") return "Confirmed";
  if (state === "failed") return "Failed";
  return "Local";
}

function txStateFromPayment(payment: PaymentResult): TxState {
  if (payment.txStatus === "confirmed" || payment.txStatus === "failed") {
    return payment.txStatus;
  }

  if (payment.txStatus === "local") {
    return "local";
  }

  return "submitted";
}

function formatDateTime(valueMs: number): string {
  return new Date(valueMs).toLocaleString("en-GB", {
    hour12: false,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapWalletError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("message channel closed") || normalized.includes("asynchronous response")) {
    return "Freighter extension communication failed. Reload the page and reconnect wallet.";
  }

  if (normalized.includes("timeout")) {
    return "Wallet request timed out. Open Freighter and approve the request, then try again.";
  }

  if (normalized.includes("user rejected") || normalized.includes("rejected")) {
    return "Wallet request was rejected. Approve the request in Freighter to continue.";
  }

  return "Failed to connect wallet. Check Freighter extension and permissions.";
}

function isTransientWalletError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return (
    normalized.includes("message channel closed") ||
    normalized.includes("asynchronous response") ||
    normalized.includes("timeout") ||
    normalized.includes("could not establish connection")
  );
}

async function withWalletTimeout<T>(operation: Promise<T>, context: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${context} timeout`));
    }, walletRequestTimeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function mapPaymentAuthorizeError(errorMessage: string, statusCode: number): string {
  if (statusCode === 409) {
    return "Payment reference already used. Please try again.";
  }

  if (errorMessage.includes("No settlement backend available")) {
    return "Settlement backend is unavailable in this environment. Configure facilitator/settlement to continue.";
  }

  if (errorMessage.includes("paymentProof required")) {
    return "On-chain authentication requires a wallet signature to authorize payment.";
  }

  if (errorMessage.includes("invalid signature")) {
    return "Invalid wallet signature. Reconnect your wallet and try again.";
  }

  if (errorMessage.includes("paymentProof expired")) {
    return "Signature expired. Generate a new payment authorization.";
  }

  if (errorMessage.includes("invalid callerAddress")) {
    return "Invalid wallet address for on-chain flow.";
  }

  if (errorMessage.includes("Model not found")) {
    return "Model unavailable. Refresh the marketplace and select another model.";
  }

  if (errorMessage.includes("Facilitator settlement required")) {
    return "Settlement service unavailable in this environment. Try again shortly.";
  }

  if (statusCode >= 500) {
    return "Infrastructure error while authorizing payment. Try again.";
  }

  return "Payment declined.";
}

function mapInferenceError(statusCode: number): string {
  if (statusCode === 402) {
    return "Payment required for inference: confirm X402 authorization.";
  }

  if (statusCode === 404) {
    return "Model not found for inference.";
  }

  if (statusCode >= 500) {
    return "Infrastructure error while running inference. Try again.";
  }

  return "Inference execution error.";
}

function getStatusTone(status: string): "ok" | "warn" | "info" | "fail" {
  const normalized = status.toLowerCase();

  if (
    normalized.includes("failed") ||
    normalized.includes("invalid") ||
    normalized.includes("missing") ||
    normalized.includes("error") ||
    normalized.includes("required") ||
    normalized.includes("unavailable") ||
    normalized.includes("declined")
  ) {
    return "fail";
  }

  if (normalized.includes("select") || normalized.includes("connect") || normalized.includes("publish") || normalized.includes("prepare") || normalized.includes("authorize")) {
    return "warn";
  }

  if (normalized.includes("connected") || normalized.includes("completed") || normalized.includes("published") || normalized.includes("confirmed")) {
    return "ok";
  }

  return "info";
}

async function resolveTxState(txHash: string): Promise<TxState> {
  try {
    const response = await fetch(`${gatewayUrl}/payments/tx/${txHash}`);

    if (!response.ok) {
      return "submitted";
    }

    const payload = (await response.json()) as { status?: TxState };
    if (payload.status === "confirmed" || payload.status === "failed") {
      return payload.status;
    }

    if (payload.status === "local") {
      return "local";
    }

    return "submitted";
  } catch {
    return "submitted";
  }
}

async function pollTxState(
  txHash: string,
  setTxStates: Dispatch<SetStateAction<Record<string, TxState>>>,
  setTxMeta: Dispatch<SetStateAction<Record<string, TxMeta>>>
): Promise<void> {
  for (let attempt = 0; attempt < txStatusMaxPollAttempts; attempt += 1) {
    const state = await resolveTxState(txHash);
    setTxStates((current) => ({ ...current, [txHash]: state }));
    setTxMeta((current) => {
      const existing = current[txHash];
      if (!existing) {
        return current;
      }
      return {
        ...current,
        [txHash]: {
          ...existing,
          updatedAtMs: Date.now()
        }
      };
    });

    if (state === "confirmed" || state === "failed" || state === "local") {
      return;
    }

    if (attempt < txStatusMaxPollAttempts - 1) {
      await wait(txStatusPollIntervalMs);
    }
  }
}

export default function HomePage() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [prompt, setPrompt] = useState("Explain in 5 lines what agentic payment is.");
  const [status, setStatus] = useState<string>("Marketplace loaded.");
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [payments, setPayments] = useState<PaymentResult[]>([]);
  const [includeLocalPayments, setIncludeLocalPayments] = useState<boolean>(false);
  const [txStates, setTxStates] = useState<Record<string, TxState>>({});
  const [txMeta, setTxMeta] = useState<Record<string, TxMeta>>({});
  const [isPayingAndInferring, setIsPayingAndInferring] = useState<boolean>(false);
  const paymentSubmitLockRef = useRef(false);
  const [paymentAuthTemporarilyBlocked, setPaymentAuthTemporarilyBlocked] = useState<boolean>(false);
  const [paymentCapabilityChecked, setPaymentCapabilityChecked] = useState<boolean>(false);
  const [paymentCapabilities, setPaymentCapabilities] = useState<PaymentCapabilities | null>(null);
  const defaultWalletAddress = "GC5LQLM7IOEC7IDE27CXOS2SH4ZXXNN7NJS3BJOZKAFSPAC2PZ34J4XX";
  const [walletAddress, setWalletAddress] = useState<string>(defaultWalletAddress);
  const [walletConnected, setWalletConnected] = useState<boolean>(false);
  const [walletSignState, setWalletSignState] = useState<WalletSignState>("unknown");
  const [newModel, setNewModel] = useState({
    providerAddress: defaultWalletAddress,
    name: "",
    description: "",
    endpoint: "/inference",
    priceMicrounit: 25000
  });

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId]
  );
  const visiblePayments = useMemo(
    () => (includeLocalPayments ? payments : payments.filter((payment) => isOnChainTxHash(payment.txHash))),
    [includeLocalPayments, payments]
  );
  const hiddenLocalPaymentsCount = useMemo(
    () => payments.filter((payment) => !isOnChainTxHash(payment.txHash)).length,
    [payments]
  );
  const latestPayment = useMemo(() => visiblePayments[0] ?? null, [visiblePayments]);
  const statusTone = getStatusTone(status);
  const canPayAndInfer =
    Boolean(selectedModel) &&
    (!requireWalletForPayment || walletConnected) &&
    isValidStellarPublicKey(walletAddress) &&
    paymentCapabilityChecked &&
    !paymentAuthTemporarilyBlocked;
  const payAndInferHint = !selectedModel
    ? "Select a model to enable payment and inference."
    : !paymentCapabilityChecked
      ? "Checking payment settlement capability..."
    : paymentAuthTemporarilyBlocked
      ? "Authorization paused: settlement backend unavailable. Change model/wallet or fix backend to retry."
    : requireWalletForPayment && !walletConnected
      ? "Connect Freighter to enable payment and inference."
      : walletSignState === "wallet-unsupported"
        ? "Freighter is connected, but this wallet cannot sign messages. Configure NEXT_PUBLIC_X402_TOKEN or update Freighter."
      : !isValidStellarPublicKey(walletAddress)
        ? "Enter a valid Stellar public key to enable payment and inference."
        : "";
  const payAndInferHintTone =
    !selectedModel ||
    !paymentCapabilityChecked ||
    (requireWalletForPayment && !walletConnected) ||
    walletSignState === "wallet-unsupported" ||
    !isValidStellarPublicKey(walletAddress)
    ? "warn"
    : "ok";
  const localSettlementSimulationEnabled =
    Boolean(paymentCapabilities?.enableLocalSettlementSimulation) &&
    !paymentCapabilities?.enableSorobanSettlement &&
    !paymentCapabilities?.enableFacilitatorSettlement;
  const walletAddressHint = !isValidStellarPublicKey(walletAddress)
    ? "Wallet address must be a valid Stellar public key starting with G."
    : walletConnected
      ? walletSignState === "wallet-unsupported"
        ? "Freighter is connected, but this wallet cannot sign messages. Configure NEXT_PUBLIC_X402_TOKEN or update Freighter."
        : "Freighter wallet connected."
      : "Wallet address valid. Connect Freighter to sign payments.";
  const walletAddressHintTone = !isValidStellarPublicKey(walletAddress)
    ? "warn"
    : walletConnected
      ? walletSignState === "wallet-unsupported"
        ? "warn"
        : "ok"
      : "info";
  const canPublishModel =
    isValidStellarPublicKey(newModel.providerAddress.trim()) &&
    newModel.name.trim().length >= 2 &&
    newModel.description.trim().length >= 5;
  const publishModelHint = !isValidStellarPublicKey(newModel.providerAddress.trim())
    ? "Enter a valid provider address to publish."
    : newModel.name.trim().length < 2
      ? "Model name must have at least 2 characters."
      : newModel.description.trim().length < 5
        ? "Description must have at least 5 characters."
        : "";
  const publishModelHintTone = !isValidStellarPublicKey(newModel.providerAddress.trim()) || newModel.name.trim().length < 2 || newModel.description.trim().length < 5
    ? "warn"
    : "ok";
  const paymentChipTone = (payment: PaymentResult): "ok" | "warn" | "fail" => {
    if (payment.success) {
      return "ok";
    }

    return payment.error ? "fail" : "warn";
  };

  useEffect(() => {
    let cancelled = false;

    async function loadPaymentCapabilities() {
      try {
        const response = await fetch(`${gatewayUrl}/payments/capabilities`);
        if (!response.ok) {
          setPaymentCapabilityChecked(true);
          return;
        }

        const payload = (await response.json()) as PaymentCapabilities;
        if (cancelled) {
          return;
        }

        setPaymentCapabilities(payload);
        const shouldBlock = payload.settlementBackendAvailable === false;
        setPaymentAuthTemporarilyBlocked(shouldBlock);
        setPaymentCapabilityChecked(true);
        if (shouldBlock) {
          setStatus(payload.reason ?? "Settlement backend is unavailable in this environment. Configure facilitator/settlement to continue.");
        }
      } catch {
        // keep current state when capabilities cannot be loaded
        setPaymentCapabilityChecked(true);
      }
    }

    async function loadModels() {
      try {
        const response = await fetch(`${gatewayUrl}/models`);
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as AiModel[];
        if (cancelled) {
          return;
        }

        setModels(payload);
        if (payload.length > 0) {
          setSelectedModelId(payload[0].id);
        }
      } catch {
        // Keep empty state when gateway is unavailable.
      }
    }

    async function loadPayments() {
      try {
        const response = await fetch(`${gatewayUrl}/payments`);
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as PaymentResult[];
        if (cancelled) {
          return;
        }

        setPayments(payload.slice(0, 5));
        setTxStates((current) => {
          const next = { ...current };
          for (const payment of payload.slice(0, 5)) {
            if (isOnChainTxHash(payment.txHash)) {
              next[payment.txHash] = txStateFromPayment(payment);
            }
          }
          return next;
        });
        setTxMeta((current) => {
          const next = { ...current };
          for (const payment of payload.slice(0, 5)) {
            if (payment.createdAt) {
              next[payment.txHash] = {
                createdAtMs: Date.parse(payment.createdAt),
                updatedAtMs: Date.parse(payment.updatedAt ?? payment.createdAt)
              };
            }
          }
          return next;
        });
      } catch {
        // keep seed state when gateway is unavailable
      }
    }

    void loadPaymentCapabilities();
    void loadModels();
    void loadPayments();

    const refreshIntervalId = setInterval(() => {
      void loadPayments();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(refreshIntervalId);
    };
  }, []);

  async function submitInference() {
    if (isPayingAndInferring || paymentSubmitLockRef.current) {
      return;
    }

    if (paymentAuthTemporarilyBlocked) {
      setStatus("Authorization is paused because settlement backend is unavailable. Change model/wallet or fix backend to retry.");
      return;
    }

    paymentSubmitLockRef.current = true;
    setIsPayingAndInferring(true);

    try {
      if (!selectedModel) {
        setStatus("Select a model before continuing.");
        return;
      }

      if (requireWalletForPayment && !walletConnected) {
        setStatus("Connect a Stellar wallet before paying.");
        return;
      }

      if (!isValidStellarPublicKey(walletAddress)) {
        setStatus("Invalid wallet address. Use a Stellar public key starting with G.");
        return;
      }

      setStatus("Preparing payment proof...");
      const paymentRef = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `pay_${crypto.randomUUID()}`
        : `pay_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
      const paymentProof = await createPaymentProof(walletAddress, selectedModel.id, selectedModel.priceMicrounit, paymentRef);

      if (requireWalletSignature && !paymentProof) {
        setStatus("Wallet signature is required in this environment.");
        return;
      }

      const inferenceAuthHeader = x402Token || buildX402HeaderValue(paymentProof);

      if (!inferenceAuthHeader) {
        if (!x402Token && walletSignState === "wallet-unsupported") {
          setStatus("Freighter is connected, but this wallet cannot sign messages. Configure NEXT_PUBLIC_X402_TOKEN or update Freighter.");
        } else {
          setStatus("Missing X402 token or wallet proof. Connect Freighter and try again.");
        }
        return;
      }

      setStatus("Authorizing payment...");
      const paymentRes = await fetch(`${gatewayUrl}/payments/authorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: selectedModel.id,
          callerAddress: walletAddress,
          amountMicrounit: selectedModel.priceMicrounit,
          paymentRef,
          paymentProof
        })
      });

      if (!paymentRes.ok) {
        let errorMessage = "";
        try {
          const errorPayload = (await paymentRes.json()) as { error?: string };
          errorMessage = errorPayload.error ?? "";
        } catch {
          // keep default local error message when payload is not JSON
        }

        if (errorMessage.includes("No settlement backend available")) {
          setPaymentAuthTemporarilyBlocked(true);
        }

        setStatus(mapPaymentAuthorizeError(errorMessage, paymentRes.status));
        return;
      }

      const paymentPayload = (await paymentRes.json()) as PaymentResult;
      setPaymentAuthTemporarilyBlocked(false);
      setPayments((current) => [paymentPayload, ...current].slice(0, 5));
      const nowMs = Date.now();
      setTxMeta((current) => ({
        ...current,
        [paymentPayload.txHash]: {
          createdAtMs: nowMs,
          updatedAtMs: nowMs
        }
      }));

      if (isOnChainTxHash(paymentPayload.txHash)) {
        setTxStates((current) => ({ ...current, [paymentPayload.txHash]: txStateFromPayment(paymentPayload) }));

        if (enableTxStatusLookup) {
          void pollTxState(paymentPayload.txHash, setTxStates, setTxMeta);
        }
      } else {
        setTxStates((current) => ({ ...current, [paymentPayload.txHash]: "local" }));
      }

      setStatus("Payment confirmed. Running inference...");
      const infRes = await fetch(`${gatewayUrl}/inference`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-402-token": inferenceAuthHeader
        },
        body: JSON.stringify({ modelId: selectedModel.id, prompt })
      });

      if (!infRes.ok) {
        setStatus(mapInferenceError(infRes.status));
        return;
      }

      const payload = (await infRes.json()) as InferenceResult;
      setResult(payload);
      setStatus("Inference completed successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error while paying and inferring.";
      setStatus(message);
    } finally {
      setIsPayingAndInferring(false);
      paymentSubmitLockRef.current = false;
    }
  }

  async function createPaymentProof(
    payerPublicKey: string,
    modelId: string,
    amountMicrounit: number,
    paymentRef: string
  ): Promise<PaymentProof | undefined> {
    const timestamp = Date.now();
    const message = buildPaymentProofMessage({
      modelId,
      callerAddress: payerPublicKey,
      amountMicrounit,
      paymentRef,
      timestamp
    });

    try {
      const walletBridge = await resolveWalletBridgeWithFallback();
      const signMessage = walletBridge?.signMessage;

      if (!signMessage) {
        setWalletSignState("wallet-unsupported");
        return undefined;
      }

      const attempts: Array<() => Promise<unknown>> = [
        () => signMessage(message, { address: payerPublicKey }),
        () => signMessage({ message, address: payerPublicKey }),
        () => signMessage(message)
      ];

      let signature = "";
      let lastSignError: unknown;
      for (const attempt of attempts) {
        try {
          const signed = await withWalletTimeout(attempt(), "wallet sign");
          signature = normalizeWalletSignature(signed);
          if (signature) {
            break;
          }
        } catch (error) {
          lastSignError = error;
          // Try the next wallet signature shape.
        }
      }

      if (!signature) {
        setWalletSignState("wallet-missing");
        if (lastSignError) {
          setStatus(mapWalletError(lastSignError));
        }
        return undefined;
      }

      setWalletSignState("wallet-signed");

      return {
        payerPublicKey,
        timestamp,
        signature
      };
    } catch {
      return undefined;
    }
  }

  async function connectWallet() {
    const walletBridge = await resolveWalletBridgeWithFallback();
    if (!walletBridge) {
      setStatus("Freighter extension not detected. Install/enable Freighter and reload the page.");
      setWalletSignState("wallet-missing");
      return;
    }

    const maxAttempts = 2;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        let publicKey = "";

        if (walletBridge.requestAccess) {
          const accessResponse = await withWalletTimeout(walletBridge.requestAccess(), "wallet connect");
          publicKey = normalizeWalletAddress(accessResponse);
        }

        if (!publicKey && walletBridge.getPublicKey) {
          publicKey = normalizeWalletAddress(await withWalletTimeout(walletBridge.getPublicKey(), "wallet public key"));
        }

        if (!publicKey && walletBridge.getAddress) {
          publicKey = normalizeWalletAddress(await withWalletTimeout(walletBridge.getAddress(), "wallet address"));
        }

        if (!publicKey || !isValidStellarPublicKey(publicKey)) {
          setStatus("Could not get a valid wallet from Freighter.");
          setWalletSignState("wallet-missing");
          return;
        }

        setWalletAddress(publicKey);
        setNewModel((current) => ({ ...current, providerAddress: publicKey }));
        setWalletConnected(true);
        setWalletSignState(walletBridge.signMessage ? "unknown" : "wallet-unsupported");
        setStatus("Stellar wallet connected.");
        return;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts - 1 && isTransientWalletError(error)) {
          setStatus("Freighter connection was interrupted. Retrying...");
          await wait(350);
          continue;
        }
      }
    }

    setStatus(mapWalletError(lastError));
    setWalletSignState("wallet-missing");
  }

  async function createModel() {
    if (!isValidStellarPublicKey(newModel.providerAddress.trim())) {
      setStatus("Provider address must be a valid Stellar public key starting with G.");
      return;
    }

    if (newModel.name.trim().length < 2) {
      setStatus("Model name must have at least 2 characters.");
      return;
    }

    if (newModel.description.trim().length < 5) {
      setStatus("Description must have at least 5 characters.");
      return;
    }

    setStatus("Publishing model to marketplace...");
    const response = await fetch(`${gatewayUrl}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newModel,
        providerAddress: newModel.providerAddress.trim(),
        name: newModel.name.trim(),
        description: newModel.description.trim(),
        endpoint: newModel.endpoint.trim()
      })
    });

    if (!response.ok) {
      let errorMessage = "Failed to register model. Check the form fields.";

      try {
        const errorPayload = (await response.json()) as { error?: string };
        if (errorPayload.error) {
          errorMessage = errorPayload.error;
        }
      } catch {
        // keep default message when payload is not JSON
      }

      setStatus(errorMessage);
      return;
    }

    const createdModel = (await response.json()) as AiModel;
    setModels((current) => [...current, createdModel]);
    setSelectedModelId(createdModel.id);

    setNewModel({
      providerAddress: walletAddress,
      name: "",
      description: "",
      endpoint: "/inference",
      priceMicrounit: 25000
    });
    setStatus("Model published and available in the marketplace.");
  }
  return (
    <main className="page">
      <section className="hero">
        <Image
          src="/Logo.png"
          alt="AXON"
          width={180}
          height={180}
          priority
        />
        <p className="kicker">AXON DEAI</p>
        <h1>Micropayments for decentralized AI services</h1>
        <p>
          Connect AI providers and consumers with an agentic payment flow inspired by X402,
          Stellar-based settlement, and a hackathon-ready experience.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Marketplace</h2>
          <p className="hint">Choose a model and run paid inference by usage.</p>
          {localSettlementSimulationEnabled ? (
            <p className="hint action-hint hint-info">
              Local settlement simulation is enabled in gateway dev mode. Transactions are local and do not settle on-chain.
            </p>
          ) : null}

          <div className="wallet-panel">
            <p className="hint">
              Consumer wallet {requireWalletForPayment ? "(required)" : "(recommended)"}
            </p>
            <button type="button" data-testid="connect-wallet-btn" className="secondary-btn" onClick={connectWallet}>
              {walletConnected ? "Reconnect wallet" : "Connect wallet (Freighter)"}
            </button>
            <label>Wallet address</label>
            <input
              data-testid="wallet-address-input"
              value={walletAddress}
              onChange={(event) => {
                setWalletAddress(event.target.value.trim());
                setWalletConnected(false);
                setWalletSignState("unknown");
              }}
              placeholder="G..."
            />
            <p className={`hint action-hint hint-${walletAddressHintTone}`}>{walletAddressHint}</p>
            {walletSignState === "wallet-signed" ? (
              <p className="hint">Message signature: received from wallet.</p>
            ) : null}
            {walletSignState === "wallet-missing" ? (
              <p className="hint">Message signature unavailable in the current wallet.</p>
            ) : null}
          </div>

          <label>Active model</label>
          <select
            data-testid="model-select"
            value={selectedModelId}
            onChange={(event) => {
              setSelectedModelId(event.target.value);
            }}
          >
            {models.length === 0 ? (
              <option value="" suppressHydrationWarning>
                No models available
              </option>
            ) : null}
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} - {model.priceMicrounit} microunits
              </option>
            ))}
          </select>

          <label>Prompt</label>
          <textarea data-testid="prompt-input" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} />

          <button data-testid="pay-and-infer-btn" onClick={submitInference} disabled={isPayingAndInferring || !canPayAndInfer}>
            {isPayingAndInferring ? "Paying and Inferring..." : "Pay and Infer"}
          </button>
          {payAndInferHint ? <p className={`hint action-hint hint-${payAndInferHintTone}`}>{payAndInferHint}</p> : null}
        </article>

        <article className="card">
          <h2>Publish model</h2>
          <p className="hint">Quick registration to list your endpoint in the marketplace.</p>

          <label>Provider address</label>
          <input
            data-testid="new-model-provider"
            value={newModel.providerAddress}
            onChange={(event) => setNewModel((prev) => ({ ...prev, providerAddress: event.target.value }))}
          />

          <label>Model name</label>
          <input
            data-testid="new-model-name"
            value={newModel.name}
            onChange={(event) => setNewModel((prev) => ({ ...prev, name: event.target.value }))}
          />

          <label>Description</label>
          <input
            data-testid="new-model-description"
            value={newModel.description}
            onChange={(event) => setNewModel((prev) => ({ ...prev, description: event.target.value }))}
          />

          <label>Price (microunits)</label>
          <input
            data-testid="new-model-price"
            type="number"
            min={1}
            value={newModel.priceMicrounit}
            onChange={(event) =>
              setNewModel((prev) => ({ ...prev, priceMicrounit: Number(event.target.value) || prev.priceMicrounit }))
            }
          />

          <button data-testid="publish-model-btn" onClick={createModel} disabled={!canPublishModel}>
            Publish to Marketplace
          </button>
          {publishModelHint ? <p className={`hint action-hint hint-${publishModelHintTone}`}>{publishModelHint}</p> : null}
        </article>
      </section>

      <section className="card">
        <h2>Payment history</h2>
        <p className="hint">Latest operations recorded by the gateway.</p>
        <label className="hint" style={{ display: "inline-flex", gap: "0.45rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={includeLocalPayments}
            onChange={(event) => setIncludeLocalPayments(event.target.checked)}
          />
          Show local/off-chain entries
        </label>
        {!includeLocalPayments && hiddenLocalPaymentsCount > 0 ? (
          <p className="hint">{hiddenLocalPaymentsCount} local/off-chain entr{hiddenLocalPaymentsCount === 1 ? "y is" : "ies are"} hidden.</p>
        ) : null}
        {visiblePayments.length ? (
          <ul className="payment-list">
            {visiblePayments.map((payment, index) => (
              <li key={`${payment.txHash || index}`}>
                {txMeta[payment.txHash] ? (
                  <p className="tx-timestamps">
                    Created at {formatDateTime(txMeta[payment.txHash].createdAtMs)} | Last update {formatDateTime(txMeta[payment.txHash].updatedAtMs)}
                  </p>
                ) : null}
                <div className="payment-row">
                  <span className={`pill ${payment.success ? "ok" : "fail"}`}>
                    {payment.success ? "Approved" : "Declined"}
                  </span>
                  <span>
                    {payment.platformFeeMicrounit} to platform, {payment.providerAmountMicrounit} to provider
                  </span>
                </div>
                <div className="tx-line">
                  {isOnChainTxHash(payment.txHash) ? (
                    <>
                      <span className="pill onchain">On-chain</span>
                      <span className={`pill tx-${txStates[payment.txHash] ?? "submitted"}`}>
                        {getTxStateLabel(txStates[payment.txHash] ?? "submitted")}
                      </span>
                      <a
                        href={`${stellarExplorerBase}${payment.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortTxHash(payment.txHash)}
                      </a>
                      {paymentRouterContractId ? (
                        <span className="contract-chip">Contract: {shortTxHash(paymentRouterContractId)}</span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span className="pill offchain">Off-chain</span>
                      <span className={`pill ${paymentChipTone(payment)}`}>{shortTxHash(payment.txHash)}</span>
                      <a
                        href={`${stellarExplorerSearchBase}${encodeURIComponent(payment.txHash)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Stellar Expert (search)
                      </a>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">No matching payments recorded yet.</p>
        )}
      </section>

      <section className="result card">
        <h2>Operation status</h2>
        <p data-testid="operation-status" className={`operation-status status-${statusTone}`}>
          {status}
        </p>
        {latestPayment ? (
          <div className="operation-payment-summary">
            <h3>Latest payment</h3>
            <p>
              {isOnChainTxHash(latestPayment.txHash) ? (
                <span className="pill onchain">On-chain</span>
              ) : (
                <span className="pill offchain">Off-chain</span>
              )}
              <span className={`pill ${latestPayment.success ? "ok" : "fail"}`}>
                {latestPayment.success ? "Approved" : "Declined"}
              </span>
              {isOnChainTxHash(latestPayment.txHash) ? (
                <a
                  className="summary-inline"
                  href={`${stellarExplorerBase}${latestPayment.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Tx: {shortTxHash(latestPayment.txHash)}
                </a>
              ) : (
                <span className="summary-inline">Tx: {shortTxHash(latestPayment.txHash)}</span>
              )}
              <span
                data-testid="latest-payment-tx-state"
                className={`pill tx-${txStates[latestPayment.txHash] ?? txStateFromPayment(latestPayment)}`}
              >
                {getTxStateLabel(txStates[latestPayment.txHash] ?? txStateFromPayment(latestPayment))}
              </span>
            </p>
            {txMeta[latestPayment.txHash] ? (
              <small>
                Last update: {formatDateTime(txMeta[latestPayment.txHash].updatedAtMs)}
              </small>
            ) : null}
            {isOnChainTxHash(latestPayment.txHash) && paymentRouterContractId ? (
              <small>Contract: {shortTxHash(paymentRouterContractId)}</small>
            ) : null}
          </div>
        ) : null}
        {result ? (
          <>
            <h3>AI response</h3>
            <p data-testid="inference-output">{result.output}</p>
            <small>Latency: {result.latencyMs} ms</small>
          </>
        ) : null}
      </section>
    </main>
  );
}
