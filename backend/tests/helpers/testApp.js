import { createContainer } from '../../src/container.js';
import { createApp } from '../../src/app.js';

export function createTestApp() {
  const container = createContainer();
  const app = createApp(container);
  return { app, container };
}
