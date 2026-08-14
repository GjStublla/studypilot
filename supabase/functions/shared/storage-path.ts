/**
 * Canonical Storage path trust boundary for rubric / knowledge documents.
 *
 * Exact plan rule: paths must be `{userId}/{rubricId}/...` under the
 * `rubrics` bucket. Never trust client-supplied bucket/path for service-role
 * Storage access — load the owned row, then validate.
 */

export const RUBRICS_STORAGE_BUCKET = "rubrics"

export function ownershipPrefix(userId: string, rubricId: string): string {
  return `${userId}/${rubricId}/`
}

/**
 * True when `path` is a non-empty object key strictly under the owned prefix.
 * Rejects traversal, absolute paths, and bucket-prefixed keys.
 */
export function isOwnedStoragePath(
  path: string | null | undefined,
  userId: string,
  rubricId: string,
): boolean {
  if (typeof path !== "string") return false
  const trimmed = path.trim()
  if (!trimmed || trimmed !== path) return false
  if (trimmed.startsWith("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    return false
  }
  // Never accept a bucket-prefixed key (e.g. rubrics/{user}/{rubric}/file).
  if (trimmed.startsWith(`${RUBRICS_STORAGE_BUCKET}/`)) return false

  const prefix = ownershipPrefix(userId, rubricId)
  if (!trimmed.startsWith(prefix)) return false
  const remainder = trimmed.slice(prefix.length)
  return remainder.length > 0 && !remainder.includes("..")
}

export type ValidatedStoragePath = {
  bucket: typeof RUBRICS_STORAGE_BUCKET
  path: string
}

/**
 * Validate a stored path against owned rubric identity.
 * Returns null when missing/invalid — callers must not touch Storage.
 */
export function validateOwnedStoragePath(
  path: string | null | undefined,
  userId: string,
  rubricId: string | null | undefined,
): ValidatedStoragePath | null {
  if (!rubricId || !isOwnedStoragePath(path, userId, rubricId)) return null
  return { bucket: RUBRICS_STORAGE_BUCKET, path: path!.trim() }
}

/**
 * Prefer rubric.file_path, then knowledge_documents.storage_path — both must
 * pass ownership validation. Never use a raw client-supplied path.
 */
export function resolveValidatedRubricStoragePath(input: {
  userId: string
  rubricId: string
  rubricFilePath?: string | null
  documentStoragePath?: string | null
}): ValidatedStoragePath | null {
  const fromRubric = validateOwnedStoragePath(
    input.rubricFilePath,
    input.userId,
    input.rubricId,
  )
  if (fromRubric) return fromRubric
  return validateOwnedStoragePath(
    input.documentStoragePath,
    input.userId,
    input.rubricId,
  )
}
