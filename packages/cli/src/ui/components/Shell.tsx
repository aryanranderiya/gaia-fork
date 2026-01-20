import React, { type ReactNode } from 'react';
import { Box, Text } from 'ink';
import { Header } from './Header.js';
import { Footer } from './Footer.js';
import { THEME_COLOR } from '../constants.js';

interface ShellProps {
    children: ReactNode;
    status: string;
    step: string;
}

const steps = ['Welcome', 'Prerequisites', 'Repository Setup', 'Finished'];

const Stepper: React.FC<{ currentStep: string }> = ({ currentStep }) => {
    return (
        <Box marginBottom={1}>
            {steps.map((s, i) => {
                const isActive = s === currentStep;
                // Simple logic: if current step index > this step index, it's done. 
                // But currentStep is a string.
                const currentIndex = steps.indexOf(currentStep);
                const isDone = currentIndex > i;

                return (
                    <Box key={s} marginRight={2}>
                        <Text color={isActive ? THEME_COLOR : isDone ? 'green' : 'gray'}>
                            {isDone ? '✔ ' : (isActive ? '● ' : '○ ')}
                            {s}
                        </Text>
                        {i < steps.length - 1 && <Text color="gray"> › </Text>}
                    </Box>
                );
            })}
        </Box>
    );
};

export const Shell: React.FC<ShellProps> = ({ children, status, step }) => {
    return (
        <Box flexDirection="column" height="100%" width="100%">
            <Box flexGrow={1} flexDirection="column">
                <Header />
                <Stepper currentStep={step} />
                <Box flexDirection="column" flexGrow={1}>
                    {children}
                </Box>
            </Box>
            <Footer status={status} step={step} />
        </Box>
    );
};
