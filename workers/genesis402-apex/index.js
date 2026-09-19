export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = "genesis402.pages.dev";
    return fetch(new Request(url.toString(), request));
  }
}
