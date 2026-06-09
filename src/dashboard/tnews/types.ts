export type TnewsItem = {
  id: string
  title: string
  link: string
  pubDate: number
  descriptionHtml: string
}

export type TnewsConfig = {
  feeds: string[]
  mirrors: string[]
  ttlMinutes: number
}

export type TnewsSourceOptions = {
  feeds: string[]
  mirrors: string[]
  ttlMinutes: number
}

export type TnewsFetchResult = {
  items: TnewsItem[]
  errors: string[]
}
