"use server";
import { submitOnboarding, onboardingSchema, type OnboardingInput } from "@/domain/onboarding";
import { ok, fail, type Result } from "@/lib/errors";

/** Public onboarding gönderimi (oturum yok; yalnızca token ile doğrulanır). */
export async function submitOnboardingAction(token: string, input: OnboardingInput): Promise<Result<{ supplierId: string }>> {
  try {
    const data = onboardingSchema.parse(input);
    const res = await submitOnboarding(token, data);
    return ok(res);
  } catch (e) {
    return fail(e);
  }
}
