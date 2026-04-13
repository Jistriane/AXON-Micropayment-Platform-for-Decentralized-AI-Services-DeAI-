import { expect, test, type Page } from "@playwright/test";

type TestModel = {
  id: string;
  providerAddress: string;
  name: string;
  description: string;
  endpoint: string;
  priceMicrounit: number;
  active: boolean;
  createdAt: string;
};

async function selectModelByName(page: Page, modelName: string) {
  const modelValue = await page.getByTestId("model-select").evaluate((select: HTMLSelectElement, name: string) => {
    const option = Array.from(select.options).find((item) => item.textContent?.includes(name));
    return option?.value ?? "";
  }, modelName);

  await expect(modelValue).not.toBe("");
  await page.getByTestId("model-select").selectOption(modelValue);
}

async function waitForMarketplace(page: Page) {
  await expect(page.getByTestId("operation-status")).toContainText("Marketplace loaded.", {
    timeout: 15_000
  });
}

function createSeedModel(): TestModel {
  return {
    id: "seed-model",
    providerAddress: "GCF5PROVIDERDEMOAXON",
    name: "AXON Summarizer v1",
    description: "Technical summaries for long documents.",
    endpoint: "/inference",
    priceMicrounit: 25000,
    active: true,
    createdAt: new Date().toISOString()
  };
}

async function installGatewayFetchMock(page: Page, options?: {
  failModels?: boolean;
  paymentStatus?: 200 | 402;
  inferenceStatus?: 200 | 404;
  paymentTxHash?: string;
  paymentTxStatus?: "submitted" | "confirmed" | "failed" | "fallback";
  txStatusSequence?: Array<"submitted" | "confirmed" | "failed" | "fallback">;
}) {
  const seedModel = createSeedModel();

  await page.addInitScript(
    ({ seed, options: runtimeOptions }) => {
      const models = [seed];
      let txStatusCallCount = 0;
      (window as Window & { __txStatusCallCount?: number }).__txStatusCallCount = 0;
      const payments: Array<{
        success: boolean;
        platformFeeMicrounit: number;
        providerAmountMicrounit: number;
        txHash: string;
      }> = [];
      const realFetch = window.fetch.bind(window);

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const method = (init?.method ?? (typeof input === "string" || input instanceof URL ? "GET" : input.method) ?? "GET").toUpperCase();

        if (url.includes("/models")) {
          if (runtimeOptions.failModels) {
            return new Response(JSON.stringify({ error: "Gateway unavailable" }), {
              status: 503,
              headers: { "Content-Type": "application/json" }
            });
          }

          if (method === "GET") {
            return new Response(JSON.stringify(models.filter((model) => model.active)), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            });
          }

          if (method === "POST") {
            const payload = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Omit<TestModel, "id" | "active" | "createdAt">;
            const createdModel: TestModel = {
              id: `model-${models.length + 1}`,
              ...payload,
              active: true,
              createdAt: new Date().toISOString()
            };
            models.push(createdModel);

            return new Response(JSON.stringify(createdModel), {
              status: 201,
              headers: { "Content-Type": "application/json" }
            });
          }
        }

        if (url.includes("/payments/authorize")) {
          if (runtimeOptions.paymentStatus === 402) {
            return new Response(
              JSON.stringify({
                success: false,
                platformFeeMicrounit: 0,
                providerAmountMicrounit: 0,
                txHash: "",
                error: "Payment declined"
              }),
              {
                status: 402,
                headers: { "Content-Type": "application/json" }
              }
            );
          }

          const payment = {
            success: true,
            platformFeeMicrounit: 1250,
            providerAmountMicrounit: 23750,
            txHash: runtimeOptions.paymentTxHash ?? "b44e11fee2688d84f8494479ca0cc63a0c825e25732a22631aac028c71b2b457",
            txStatus: runtimeOptions.paymentTxStatus
          };
          payments.push(payment);

          return new Response(JSON.stringify(payment), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        if (url.includes("/payments/tx/") && method === "GET") {
          const nextStatus = runtimeOptions.txStatusSequence?.[
            Math.min(txStatusCallCount, runtimeOptions.txStatusSequence.length - 1)
          ];
          txStatusCallCount += 1;
          (window as Window & { __txStatusCallCount?: number }).__txStatusCallCount = txStatusCallCount;

          return new Response(
            JSON.stringify({
              txHash: "b44e11fee2688d84f8494479ca0cc63a0c825e25732a22631aac028c71b2b457",
              status: nextStatus ?? "confirmed",
              source: "horizon"
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        if (url.includes("/payments") && method === "GET") {
          return new Response(JSON.stringify(payments), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }

        if (url.includes("/inference")) {
          if (runtimeOptions.inferenceStatus === 404) {
            return new Response(JSON.stringify({ error: "Model not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" }
            });
          }

          const payload = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as { modelId: string; prompt: string };
          const model = models.find((item) => item.id === payload.modelId && item.active);

          if (!model) {
            return new Response(JSON.stringify({ error: "Model not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" }
            });
          }

          return new Response(
            JSON.stringify({
              modelId: payload.modelId,
              output: `Model ${payload.modelId} processed: ${payload.prompt.slice(0, 220)}`,
              latencyMs: 1,
              paid: true
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        return realFetch(input, init);
      };
    },
    { seed: seedModel, options: options ?? {} }
  );
}

test("publishes model and runs paid inference", async ({ page }) => {
  const unique = Date.now();
  const modelName = `Smoke UI ${unique}`;

  await installGatewayFetchMock(page, { txStatusSequence: ["submitted", "confirmed"] });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Micropayments for decentralized AI services" })).toBeVisible();
  await waitForMarketplace(page);

  await page.getByTestId("new-model-provider").fill("GSMOKEUIPROVIDER12345");
  await page.getByTestId("new-model-name").fill(modelName);
  await page.getByTestId("new-model-description").fill("Model created by UI E2E test.");
  await page.getByTestId("new-model-price").fill("33000");
  await page.getByTestId("publish-model-btn").click();

  await expect(page.getByTestId("operation-status")).toContainText("Model published and available in the marketplace.");

  await selectModelByName(page, modelName);
  await page.getByTestId("prompt-input").fill("Briefly explain agentic payment.");
  await page.getByTestId("pay-and-infer-btn").click();

  await expect(page.getByTestId("operation-status")).toContainText("Inference completed successfully.");
  await expect(page.getByTestId("inference-output")).toContainText("processed");
  await expect
    .poll(async () =>
      page.evaluate(() => (window as Window & { __txStatusCallCount?: number }).__txStatusCallCount ?? 0)
    )
    .toBeGreaterThan(0);
  await expect(page.getByTestId("latest-payment-tx-state")).toContainText("Submitted");
  await expect(page.getByText("Payment history")).toBeVisible();
  await expect(page.locator(".payment-list li").first().getByText("On-chain")).toBeVisible();
  await expect(page.locator(".payment-list li").first().locator("a", { hasText: "b44e11fee2...71b2b457" })).toHaveAttribute(
    "href",
    "https://stellar.expert/explorer/testnet/tx/b44e11fee2688d84f8494479ca0cc63a0c825e25732a22631aac028c71b2b457"
  );
});

test("updates tx state from submitted to confirmed in card", async ({ page }) => {
  const unique = Date.now();
  const modelName = `Smoke Tx Transition ${unique}`;

  await installGatewayFetchMock(page, { txStatusSequence: ["submitted", "submitted", "confirmed"] });
  await page.goto("/");
  await waitForMarketplace(page);

  await page.getByTestId("new-model-provider").fill("GSMOKETXTRANSITION12345");
  await page.getByTestId("new-model-name").fill(modelName);
  await page.getByTestId("new-model-description").fill("Model to validate tx state transition.");
  await page.getByTestId("new-model-price").fill("36000");
  await page.getByTestId("publish-model-btn").click();
  await expect(page.getByTestId("operation-status")).toContainText("Model published and available in the marketplace.");

  await selectModelByName(page, modelName);
  await page.getByTestId("prompt-input").fill("Submitted to confirmed transition test.");
  await page.getByTestId("pay-and-infer-btn").click();

  await expect(page.getByTestId("operation-status")).toContainText("Inference completed successfully.");
  await expect(page.getByTestId("latest-payment-tx-state")).toContainText("Submitted");
  await expect
    .poll(async () => (await page.getByTestId("latest-payment-tx-state").textContent()) ?? "", {
      timeout: 8_000
    })
    .toContain("Confirmed");
});

test("shows fallback summary in operation card", async ({ page }) => {
  const unique = Date.now();
  const modelName = `Smoke Fallback ${unique}`;

  await installGatewayFetchMock(page, { paymentTxHash: "mock_fallback_tx" });
  await page.goto("/");
  await waitForMarketplace(page);

  await page.getByTestId("new-model-provider").fill("GSMOKEFALLBACK12345");
  await page.getByTestId("new-model-name").fill(modelName);
  await page.getByTestId("new-model-description").fill("Model to validate fallback in summary.");
  await page.getByTestId("new-model-price").fill("34000");
  await page.getByTestId("publish-model-btn").click();
  await expect(page.getByTestId("operation-status")).toContainText("Model published and available in the marketplace.");

  await selectModelByName(page, modelName);
  await page.getByTestId("prompt-input").fill("Fallback flow test.");
  await page.getByTestId("pay-and-infer-btn").click();

  await expect(page.getByTestId("operation-status")).toContainText("Inference completed successfully.");
  await expect(page.getByTestId("latest-payment-tx-state")).toContainText("Fallback");
});

test("shows error when payment is declined", async ({ page }) => {
  const unique = Date.now();
  const modelName = `Smoke Payment Error ${unique}`;

  await installGatewayFetchMock(page, { paymentStatus: 402 });
  await page.goto("/");
  await waitForMarketplace(page);
  await page.getByTestId("new-model-provider").fill("GSMOKEUIPROVIDER54321");
  await page.getByTestId("new-model-name").fill(modelName);
  await page.getByTestId("new-model-description").fill("Model to simulate payment error.");
  await page.getByTestId("new-model-price").fill("35000");
  await page.getByTestId("publish-model-btn").click();

  await expect(page.getByTestId("operation-status")).toContainText("Model published and available in the marketplace.");

  await selectModelByName(page, modelName);
  await page.getByTestId("prompt-input").fill("Payment error test.");
  await page.getByTestId("pay-and-infer-btn").click();

  await expect(page.getByTestId("operation-status")).toContainText("Payment declined.");
});

test("shows error when model does not exist for inference", async ({ page }) => {
  await installGatewayFetchMock(page, { inferenceStatus: 404 });
  await page.goto("/");
  await waitForMarketplace(page);

  await page.getByTestId("prompt-input").fill("Missing model test.");
  await page.getByTestId("pay-and-infer-btn").click();

  await expect(page.getByTestId("operation-status")).toContainText("Model not found for inference.");
});

test("shows model loading failure when gateway is unavailable", async ({ page }) => {
  await installGatewayFetchMock(page, { failModels: true });

  await page.goto("/");
  await page.getByTestId("new-model-provider").fill("GFAILPROVIDER12345");
  await page.getByTestId("new-model-name").fill("Gateway Failure");
  await page.getByTestId("new-model-description").fill("Publish attempt while gateway is unavailable.");
  await page.getByTestId("new-model-price").fill("29000");
  await page.getByTestId("publish-model-btn").click();

  await expect(page.getByTestId("operation-status")).toContainText("Failed to register model. Check the form fields.");
});
