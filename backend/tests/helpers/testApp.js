import { createContainer } from '../../src/container.js';
import { createApp } from '../../src/app.js';

export function createTestApp(options = {}) {
  const container = createContainer(options);
  const app = createApp(container);
  return { app, container };
}
