import type { GraphvizApi } from './contract';

declare global {
  interface Window {
    graphviz: GraphvizApi;
  }
}
