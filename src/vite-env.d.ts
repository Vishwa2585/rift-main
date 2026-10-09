/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

declare module "*.css?url" {
  const src: string;
  export default src;
}
