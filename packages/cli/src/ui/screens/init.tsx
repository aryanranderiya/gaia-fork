import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { Spinner, ProgressBar } from '@inkjs/ui';
import TextInput from 'ink-text-input';
import { useInput } from 'ink';
import { CLIStore } from '../store.js';
import { Shell } from '../components/Shell.js';
import { THEME_COLOR } from '../constants.js';

interface CheckItemProps {
    label: string;
    status: 'pending' | 'success' | 'error' | 'missing';
}

const CheckItem: React.FC<CheckItemProps> = ({ label, status }) => (
    <Box>
        <Box marginRight={1}>
            {status === 'pending' ? <Spinner type="dots" /> :
                status === 'success' ? <Text color={THEME_COLOR}>✔</Text> :
                    status === 'error' ? <Text color="red">✖</Text> :
                        <Text color="yellow">⚠</Text>}
        </Box>
        <Text>{label}</Text>
    </Box>
);

const WelcomeStep: React.FC<{ onConfirm: () => void }> = ({ onConfirm }) => {
    useInput((input, key) => {
        if (key.return) {
            onConfirm();
        }
    });

    return (
        <Box flexDirection="column" paddingX={2} borderStyle="round" borderColor={THEME_COLOR}>
            <Text bold>Welcome to the Interactive GAIA Setup</Text>

            <Box flexDirection="column" marginTop={1} marginBottom={1}>
                <Text>This wizard will guide you through the setup process:</Text>
                <Text>  1. Check Prerequisites (Git, Docker, Mise)</Text>
                <Text>  2. Clone the Repository</Text>
            </Box>
            <Text color={THEME_COLOR}>Press Enter to start...</Text>
        </Box>
    );
};

const PathInputStep: React.FC<{ defaultValue: string; onSubmit: (val: string) => void }> = ({ defaultValue, onSubmit }) => {
    const [value, setValue] = useState(defaultValue);

    return (
        <Box flexDirection="column" marginTop={1} paddingX={1} borderStyle="round" borderColor={THEME_COLOR}>
            <Text>Where should we clone the repository?</Text>
            <Box>
                <Text color={THEME_COLOR}>➜ </Text>
                <TextInput
                    value={value}
                    onChange={setValue}
                    onSubmit={onSubmit}
                />
            </Box>
            <Text color="gray">(Press Enter for default: {defaultValue})</Text>
        </Box>
    );
};

const FinishedStep: React.FC<{ onConfirm: () => void }> = ({ onConfirm }) => {
    useInput((input, key) => {
        if (key.return) {
            onConfirm();
        }
    });

    return (
        <Box flexDirection="column" marginTop={2} borderStyle="round" borderColor={THEME_COLOR} padding={1}>
            <Text color={THEME_COLOR} bold>You are all set! 🚀</Text>
            <Text>Run <Text color={THEME_COLOR} bold>mise dev</Text> to run the application.</Text>
            <Box marginTop={1}>
                <Text dimColor>Press Enter to exit</Text>
            </Box>
        </Box>
    );
};

export const InitScreen: React.FC<{ store: CLIStore }> = ({ store }) => {
    const [state, setState] = useState(store.currentState);

    useEffect(() => {
        const update = () => setState({ ...store.currentState });
        store.on('change', update);
        return () => { store.off('change', update); };
    }, [store]);

    return (
        <Shell status={state.status} step={state.step}>
            {state.step === 'Welcome' && state.inputRequest?.id === 'welcome' && (
                <WelcomeStep onConfirm={() => store.submitInput(true)} />
            )}

            {state.step === 'Prerequisites' && state.data.checks && (
                <Box flexDirection="column" borderStyle="round" paddingX={1} borderColor={THEME_COLOR}>
                    <Text bold>System Checks</Text>
                    <Box flexDirection="column" marginTop={1}>
                        <CheckItem label="Git" status={state.data.checks.git} />
                        <CheckItem label="Docker" status={state.data.checks.docker} />
                        <CheckItem label="Mise" status={state.data.checks.mise} />
                    </Box>
                </Box>
            )}

            {state.inputRequest?.id === 'repo_path' && (
                <PathInputStep
                    defaultValue={state.inputRequest.meta.default}
                    onSubmit={(value) => store.submitInput(value)}
                />
            )}

            {state.step === 'Repository Setup' && (
                <Box flexDirection="column" borderStyle="round" padding={1} borderColor={THEME_COLOR}>
                    <Text bold>Cloning Repository</Text>
                    <Box marginTop={1}>
                        <ProgressBar value={state.data.repoProgress || 0} />
                    </Box>
                </Box>
            )}

            {state.step === 'Finished' && state.inputRequest?.id === 'finish' && (
                <FinishedStep onConfirm={() => store.submitInput(true)} />
            )}

            {state.error && (
                <Box borderStyle="single" borderColor="red" padding={1} marginTop={2}>
                    <Text color="red">Error: {state.error.message}</Text>
                </Box>
            )}
        </Shell>
    );
};

