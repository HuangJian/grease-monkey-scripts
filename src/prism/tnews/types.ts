export type TnewsItem = {
  id: string
  title: string
  link: string
  pubDate: number
  descriptionHtml: string
}

export type TnewsConfig = {
  ttlMinutes: number
}

export type TnewsSourceOptions = {
  ttlMinutes: number
}

export type TnewsFetchResult = {
  items: TnewsItem[]
  errors: string[]
}
