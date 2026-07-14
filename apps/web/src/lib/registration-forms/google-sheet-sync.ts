import { getRegistrationForm } from "./server";

/**
 * Auto-sync registrations to Google Sheets when the event uses the
 * volleyball form (legacy type or slug) or a form with syncToGoogleSheet.
 */
export async function shouldSyncRegistrationToGoogleSheet(
  eventDoc: Record<string, unknown> | undefined
): Promise<boolean> {
  if (!eventDoc) return false;

  if (eventDoc.registrationFormType === "volleyball") return true;

  const formId =
    typeof eventDoc.registrationFormId === "string"
      ? eventDoc.registrationFormId.trim()
      : "";
  if (!formId) return false;

  const form = await getRegistrationForm(formId);
  if (!form) return false;
  return form.slug === "volleyball" || form.syncToGoogleSheet === true;
}
