import { NextResponse } from "next/server";

function getBackendBaseUrl() {
  const configured =
    process.env.FASTAPI_URL || process.env.NEXT_PUBLIC_FASTAPI_URL || "http://localhost:8000";
  return configured.replace(/\/+$/, "");
}

export async function POST(request: Request) {
  let incomingFormData: FormData;

  try {
    incomingFormData = await request.formData();
  } catch {
    return NextResponse.json(
      { detail: "Invalid form data. Please upload an image file." },
      { status: 400 }
    );
  }

  const image = incomingFormData.get("image");
  const imageBase64 = incomingFormData.get("image_base64");
  const userPortionDescription = incomingFormData.get("user_portion_description");

  if (!(image instanceof File) && !(typeof imageBase64 === "string" && imageBase64.trim())) {
    return NextResponse.json(
      { detail: "Missing image. Please upload an image or provide base64 input." },
      { status: 400 }
    );
  }

  const outboundFormData = new FormData();
  if (image instanceof File) {
    outboundFormData.append("image", image, image.name || "meal-image");
  }
  if (typeof imageBase64 === "string" && imageBase64.trim()) {
    outboundFormData.append("image_base64", imageBase64.trim());
  }
  if (typeof userPortionDescription === "string" && userPortionDescription.trim()) {
    outboundFormData.append("user_portion_description", userPortionDescription.trim());
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(`${getBackendBaseUrl()}/analyze-image`, {
      method: "POST",
      body: outboundFormData,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { detail: "Analysis service is currently unavailable. Please try again shortly." },
      { status: 502 }
    );
  }

  const rawBody = await upstreamResponse.text();
  let responseBody: unknown = null;
  try {
    responseBody = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    responseBody = { detail: rawBody || "Unexpected backend response." };
  }

  return NextResponse.json(responseBody, { status: upstreamResponse.status });
}
