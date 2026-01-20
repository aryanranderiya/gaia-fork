import { render } from 'ink';
import React from 'react';
import { createStore } from '../../ui/store.js';
import { App } from '../../ui/app.js';
import { runInitFlow } from './flow.js';

export async function runInit() {
    const store = createStore();
    
    const { unmount } = render(React.createElement(App, { store, command: 'init' }));

    try {
        await runInitFlow(store);
    } catch (error) {
        store.setError(error as Error);
    }
    
    unmount();
    process.exit(0);
}
