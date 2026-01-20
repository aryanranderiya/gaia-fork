import React from 'react';
import { InitScreen } from './screens/init.js';
import { CLIStore } from './store.js';

export const App: React.FC<{ store: CLIStore; command: string }> = ({ store, command }) => {
    // Basic router based on command
    if (command === 'init') {
        return <InitScreen store={store} />;
    }
    return null;
};
