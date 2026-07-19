// photos.js
// -----------------------------------------------------------------------
// Photo upload via Cloudinary (not Firebase Storage — Firebase Storage
// requires the Blaze billing plan, which hit an account-level hold
// during setup. Cloudinary's free tier needs no credit card and no
// billing review, so it's what BizCheck uses for every photo: receipts
// and jobsite/note photos alike).
//
// Uses an UNSIGNED upload preset, which is the correct/secure way to
// upload directly from the browser with no backend server: unsigned
// presets can only upload (no delete/list/admin access), so there's no
// sensitive credential to protect here — safe to call straight from
// client-side JS the same way firebase-config.js's apiKey is safe to
// expose (it's a public identifier, not a secret).
//
// >>> MANUAL STEP <<<
// Sign up free at https://cloudinary.com (no credit card required), then:
//   1. Dashboard shows your "Cloud name" — paste it into CLOUD_NAME below.
//   2. Settings (gear icon) > Upload > Upload presets > Add upload preset
//      > set Signing Mode to "Unsigned" > Save. Paste the preset name
//      into UPLOAD_PRESET below.
// -----------------------------------------------------------------------

const CLOUD_NAME = "wilm6inz";
const UPLOAD_PRESET = "hdit2a2l";

/**
 * Uploads a receipt photo for one expense and returns its public URL.
 * See uploadToCloudinary below for the compression/upload details shared
 * with uploadJobNotePhoto.
 */
export function uploadReceiptPhoto(businessId, jobId, expenseId, file) {
  return uploadToCloudinary(`bizcheck/${businessId}/${jobId}/expenses/${expenseId}`, file);
}

/**
 * Uploads a jobsite/note photo (progress photos, site conditions, etc.)
 * and returns its public URL. Same compression and Cloudinary preset as
 * receipt photos, just filed under a different folder so the two stay
 * easy to tell apart in the Cloudinary dashboard.
 */
export function uploadJobNotePhoto(businessId, jobId, noteId, file) {
  return uploadToCloudinary(`bizcheck/${businessId}/${jobId}/notes/${noteId}`, file);
}

/**
 * Uploads a photo attached to a Bulletin Board post and returns its public
 * URL. Not scoped under a job (the bulletin is company-wide), so it gets
 * its own top-level folder instead of the jobId-scoped ones above — same
 * compression and Cloudinary preset either way.
 */
export function uploadBulletinPhoto(businessId, postId, file) {
  return uploadToCloudinary(`bizcheck/${businessId}/bulletin/${postId}`, file);
}

// --- internal helpers -----------------------------------------------------

/**
 * Compresses an image file and POSTs it to Cloudinary's unsigned upload
 * endpoint, scoped under the given folder path. Shared core behind both
 * exported upload functions above — they only differ in which folder
 * the photo lands in.
 */
async function uploadToCloudinary(folder, file) {
  const compressed = await compressImage(file);

  const formData = new FormData();
  formData.append("file", compressed);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Cloudinary upload failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.secure_url;
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.7;

/**
 * Resizes an image file down to MAX_DIMENSION on its longest side and
 * re-encodes it as a compressed JPEG. Falls back to the original file if
 * anything about the compression step fails (e.g. an unusual file type) —
 * a slightly slower upload beats a broken one.
 */
async function compressImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    return blob || file;
  } catch (err) {
    console.error("Photo compression failed, uploading original file instead:", err);
    return file;
  }
}
