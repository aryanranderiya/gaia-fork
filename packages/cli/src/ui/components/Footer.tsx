import React from 'react';
import { Box, Text } from 'ink';
import { THEME_COLOR } from '../constants.js';

interface FooterProps {
    status: string;
    step: string;
}

export const Footer: React.FC<FooterProps> = ({ status, step }) => {
    if (step.toLowerCase() == "welcome") return;
    return (
        <Box
            width="100%"
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            justifyContent="space-between"
        >
            <Text color={THEME_COLOR}>Status: {step}</Text>
            <Text color="white">{status}</Text>
        </Box>
    );
};
