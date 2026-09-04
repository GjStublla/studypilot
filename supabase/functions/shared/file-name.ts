export const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/csv": ".csv",
  "text/html": ".html",
  "text/markdown": ".md",
  "text/plain": ".txt",
}

const SUPPORTED_EXTENSIONS = new Set(Object.values(MIME_EXTENSIONS))

export function hasSupportedFileExtension(name: string): boolean {
  const match = /\.([a-z0-9]{1,12})$/i.exec(name.trim())
  return Boolean(match && SUPPORTED_EXTENSIONS.has(`.${match[1].toLowerCase()}`))
}

export function ensureFileExtension(name: string, mimeType: string): string {
  const safeName = name.trim().replace(/[\\/:*?"<>|]/g, "_") || "document"
  const normalizedMimeType = mimeType.split(";", 1)[0].trim().toLowerCase()
  const mimeExtension = MIME_EXTENSIONS[normalizedMimeType] ?? ".txt"
  if (hasSupportedFileExtension(safeName)) return safeName
  if (/\.[a-z0-9]{1,12}$/i.test(safeName)) {
    return `${safeName.replace(/\.[a-z0-9]{1,12}$/i, "")}${mimeExtension}`
  }
  return `${safeName}${mimeExtension}`
}