function normalize(message: string | null | undefined): string {
  return (message || "").trim();
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function isTechnicalDetail(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    includesAny(normalized, [
      "traceback",
      "exception",
      "runtimeerror",
      "httpx",
      "openai",
      "supabase",
      "postgrest",
      "schema cache",
      "create_meal_with_items",
      "stack",
      "object object",
      "syntaxerror",
      "typeerror",
      "validationerror",
    ]) || /\[[\d,\s]+\]/.test(value)
  );
}

export function mapAuthError(message: string | null | undefined): string {
  const value = normalize(message).toLowerCase();
  if (!value) {
    return "Unable to complete sign-in right now. Please try again.";
  }

  if (includesAny(value, ["invalid login credentials", "invalid email or password"])) {
    return "Email or password is incorrect. Please try again.";
  }
  if (includesAny(value, ["email not confirmed", "confirm your email"])) {
    return "Please confirm your email before logging in.";
  }
  if (includesAny(value, ["password"])) {
    return "Please check your password and try again.";
  }
  if (includesAny(value, ["already registered", "already in use", "user already registered"])) {
    return "An account with this email already exists. Please log in instead.";
  }
  if (includesAny(value, ["network", "fetch", "timeout"])) {
    return "Network issue detected. Check your connection and try again.";
  }
  if (includesAny(value, ["token", "jwt", "session", "expired", "unauthorized"])) {
    return "Your session expired. Please sign in again.";
  }

  return isTechnicalDetail(value)
    ? "Authentication failed. Please retry in a moment."
    : normalize(message);
}

export function mapApiError(message: string | null | undefined, fallbackMessage: string): string {
  const original = normalize(message);
  const value = original.toLowerCase();
  if (!value) {
    return fallbackMessage;
  }

  if (includesAny(value, ["session", "expired", "unauthorized", "auth"])) {
    return "Your session expired. Please log in again.";
  }
  if (includesAny(value, ["timeout", "timed out", "abort"])) {
    return "This request took too long. Please try again.";
  }
  if (includesAny(value, ["network", "failed to fetch", "unable to reach", "unreachable"])) {
    return "Network issue detected. Please check your connection and retry.";
  }
  if (includesAny(value, ["invalid image", "no food", "base64", "multipart", "request body"])) {
    return "We couldn't analyze this meal. Please try another clear photo.";
  }
  if (includesAny(value, ["date must be", "invalid date", "timezone"])) {
    return "That date or timezone looks invalid. Please retry.";
  }
  if (includesAny(value, ["service unavailable", "temporarily unavailable"])) {
    return "Service is temporarily unavailable. Please try again shortly.";
  }
  if (
    includesAny(value, [
      "schema cache",
      "create_meal_with_items",
      "function is not deployed",
      "rpc",
      "postgrest",
    ])
  ) {
    return "Meal save setup is still being finalized. Please try again shortly.";
  }

  return isTechnicalDetail(original) ? fallbackMessage : original;
}

