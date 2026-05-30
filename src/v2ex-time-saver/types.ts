export type AuthorRecord = {
  url: string
  label?: string
}

export type AuthorValue = string | AuthorRecord

export type AuthorMap = Map<string, AuthorValue>

export type RequestDetails = {
  url: string
  method: string
  timeout?: number
  onload(response: { responseText: string }): void
}

export type Runtime = {
  document: Document
  location: Location
  DOMParser: typeof DOMParser
  prompt(message?: string, defaultValue?: string): string | null
  getValue<T>(key: string, defaultValue: T): Promise<T>
  setValue(key: string, value: string): Promise<void> | void
  request(details: RequestDetails): void
  addStyle(css: string): void
}
