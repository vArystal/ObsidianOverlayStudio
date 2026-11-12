export function buildHashUrl(route: string) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = route.startsWith('/') ? route : `/${route}`
  return url.toString()
}
