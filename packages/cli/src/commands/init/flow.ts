/**
 * Init command flow orchestration.
 * Handles the step-by-step initialization process.
 * @module commands/init/flow
 */

import type { CLIStore } from '../../ui/store.js';
import * as prereqs from '../../lib/prerequisites.js';
import * as git from '../../lib/git.js';
import * as envParser from '../../lib/env-parser.js';
import * as envWriter from '../../lib/env-writer.js';

import * as fs from 'fs';
import * as path from 'path';

// Dev mode: Use current workspace instead of cloning
// Set to true for development testing, false for production
const DEV_MODE = process.env.GAIA_CLI_DEV === 'true';

/**
 * Delays execution for a specified duration.
 * Used for UX timing between steps.
 * @param ms - Milliseconds to delay
 */
const delay = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/**
 * Runs the complete initialization flow.
 * Steps: Welcome -> Prerequisites -> Repository Setup -> Environment Setup -> Finished
 * @param store - CLI store instance for state management
 * @throws Error if any critical step fails
 */
export async function runInitFlow(store: CLIStore): Promise<void> {
    // 0. Welcome & Config
    store.setStep('Welcome');
    store.setStatus('Waiting for user input...');
    await store.waitForInput('welcome');

    
    // 1. Prerequisites
    store.setStep('Prerequisites');
    store.setStatus('Checking system requirements...');
    
    // Initialize data for this step
    store.updateData('checks', {
        git: 'pending',
        docker: 'pending',
        mise: 'pending'
    });

    await delay(800); // Minimal delay for UX

    // Check Git
    store.setStatus('Checking Git...');
    const gitStatus = await prereqs.checkGit();
    store.updateData('checks', { ...store.currentState.data.checks, git: gitStatus });

    // Check Docker
    store.setStatus('Checking Docker...');
    const dockerStatus = await prereqs.checkDocker();
    store.updateData('checks', { ...store.currentState.data.checks, docker: dockerStatus });

    // Check Mise
    store.setStatus('Checking Mise...');
    let miseStatus = await prereqs.checkMise();
    store.updateData('checks', { ...store.currentState.data.checks, mise: miseStatus });

    if (miseStatus === 'missing') {
        store.setStatus('Installing Mise...');
        const installed = await prereqs.installMise();
        miseStatus = installed ? 'success' : 'error';
        store.updateData('checks', { ...store.currentState.data.checks, mise: miseStatus });
    }

    if (gitStatus === 'error' || dockerStatus === 'error' || miseStatus === 'error') {
        store.setError(new Error('Prerequisites failed'));
        return;
    }

    // Clear status after prerequisites complete
    store.setStatus('Prerequisites check complete!');
    await delay(1000);

    let repoPath = '';
    
    if (DEV_MODE) {
        // Dev mode: Use current workspace (find root by looking for apps/api)
        let currentDir = process.cwd();
        while (currentDir !== '/') {
            if (fs.existsSync(path.join(currentDir, 'apps/api/app/config/settings_validator.py'))) {
                repoPath = currentDir;
                break;
            }
            currentDir = path.dirname(currentDir);
        }
        if (!repoPath) {
            store.setError(new Error('DEV_MODE: Could not find workspace root. Run from within the gaia repo.'));
            return;
        }
        store.setStep('Repository Setup');
        store.setStatus('[DEV MODE] Using current workspace...');
        await delay(500);
        store.setStatus('Repository ready!');
    } else {
        // Production: Clone repo to user-specified path
        // Get repository path from user
        while (true) {
            repoPath = await store.waitForInput('repo_path', { default: './gaia' }) as string;
            if (fs.existsSync(repoPath)) {
                const stat = fs.statSync(repoPath);
                if (!stat.isDirectory()) {
                     store.setError(new Error(`Path ${repoPath} exists and is not a directory.`));
                     await delay(2000);
                     store.setError(null);
                     continue;
                }
                
                const files = fs.readdirSync(repoPath);
                if (files.length > 0) {
                    store.setError(new Error(`Directory ${repoPath} is not empty. Please choose another path.`));
                    await delay(2000);
                    store.setError(null);
                    continue;
                }
            }
            break;
        }


        // 2. Repo Setup
        store.setStep('Repository Setup');
        store.setStatus('Preparing repository...');
        store.updateData('repoProgress', 0);
        store.updateData('repoPhase', '');

        try {
            await git.setupRepo(repoPath, 'https://github.com/theexperiencecompany/gaia.git', (progress, phase) => {
                store.updateData('repoProgress', progress);
                if (phase) {
                    store.updateData('repoPhase', phase);
                    store.setStatus(`${phase}...`);
                } else {
                    store.setStatus(`Cloning repository to ${repoPath}... ${progress}%`);
                }
            });
            store.setStatus('Repository ready!');
        } catch (e) {
            store.setError(e as Error);
            return;
        }
    }

    await delay(1000);

    // 3. Environment Setup
    store.setStep('Environment Setup');
    store.setStatus('Configuring environment...');

    // Ask user for setup mode (selfhost vs developer)
    const setupMode = await store.waitForInput('setup_mode') as envParser.SetupMode;
    store.updateData('setupMode', setupMode);
    
    // Ask user for environment variable setup method
    store.setStatus('Configuring environment variables...');
    const envMethod = await store.waitForInput('env_method');

    const envValues: Record<string, string> = {};
    
    // Add ENV variable based on setup mode
    envValues['ENV'] = 'development';

    // Always add infrastructure defaults (these override Infisical for local/Docker URLs)
    const infraVars = envParser.getInfrastructureVariables();
    for (const varName of infraVars) {
        const defaultVal = envParser.getDefaultValue(varName, setupMode);
        if (defaultVal) {
            envValues[varName] = defaultVal;
        }
    }

    if (envMethod === 'infisical') {
        // Collect Infisical credentials
        store.setStatus('Configuring Infisical...');
        const infisicalConfig = await store.waitForInput('env_infisical') as {
            INFISICAL_TOKEN: string;
            INFISICAL_PROJECT_ID: string;
            INFISICAL_MACHINE_IDENTITY_CLIENT_ID: string;
            INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET: string;
        };
        
        // Add Infisical credentials to env values
        envValues['INFISICAL_TOKEN'] = infisicalConfig.INFISICAL_TOKEN;
        envValues['INFISICAL_PROJECT_ID'] = infisicalConfig.INFISICAL_PROJECT_ID;
        envValues['INFISICAL_MACHINE_IDENTITY_CLIENT_ID'] = infisicalConfig.INFISICAL_MACHINE_IDENTITY_CLIENT_ID;
        envValues['INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET'] = infisicalConfig.INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET;
        
        // Write .env file with Infisical config + infrastructure defaults
        store.setStatus('Writing API environment configuration...');
        try {
            const apiEnvPath = path.join(repoPath, 'apps', 'api');
            envWriter.writeEnvFile(apiEnvPath, envValues);
            store.setStatus('API configuration saved!');
        } catch (e) {
            store.setError(new Error(`Failed to write API .env file: ${(e as Error).message}`));
            return;
        }
        
        // Write web .env file (just the backend URL)
        store.setStatus('Writing web environment configuration...');
        try {
            const webEnvPath = path.join(repoPath, 'apps', 'web');
            const apiBaseUrl = setupMode === 'selfhost' 
                ? 'http://localhost:8000/api/v1/'
                : 'http://localhost:8000/api/v1/';
            envWriter.writeEnvFile(webEnvPath, {
                'NEXT_PUBLIC_API_BASE_URL': apiBaseUrl
            });
            store.setStatus('Web configuration saved!');
        } catch (e) {
            store.setError(new Error(`Failed to write web .env file: ${(e as Error).message}`));
            return;
        }
        
        await delay(1000);
        
        // Continue to dependency installation (don't skip to finish)
    } else {
        // Manual setup: Parse and prompt for environment variables
        // Parse environment variables from settings.py
        store.setStatus('Parsing environment variables...');
        let categories: envParser.EnvCategory[];
        try {
            console.error('DEBUG repoPath:', repoPath);
            categories = envParser.parseSettings(repoPath);
            console.error('DEBUG BEFORE applyModeDefaults:', categories.filter(c => c.alternativeGroup).map(c => ({ name: c.name, alt: c.alternativeGroup })));
            // Apply mode-specific defaults
            categories = envParser.applyModeDefaults(categories, setupMode);
            console.error('DEBUG AFTER applyModeDefaults:', categories.filter(c => c.alternativeGroup).map(c => ({ name: c.name, alt: c.alternativeGroup })));
        } catch (e) {
            store.setError(new Error(`Failed to parse settings: ${(e as Error).message}`));
            return;
        }

    // Get all variables (required first, then optional by category)
    const coreVars = envParser.getCoreVariables(categories);
    const otherVars = categories
        .flatMap(c => c.variables)
        .filter(v => !coreVars.find(cv => cv.name === v.name));
    
    // Sort: required variables first, then optional
    const sortedOtherVars = [...otherVars].sort((a, b) => {
        if (a.required && !b.required) return -1;
        if (!a.required && b.required) return 1;
        return 0;
    });
    
    const allVars = [...coreVars, ...sortedOtherVars];
    
    store.updateData('envCategories', categories);
    store.updateData('envVarTotal', allVars.length);

    // Find alternative groups (groups that reference each other as alternatives)
    const alternativeGroupNames = new Set<string>();
    const alternativePairs: envParser.EnvCategory[][] = [];
    const processedAlternatives = new Set<string>();
    
    for (const category of categories) {
        if (category.alternativeGroup && !processedAlternatives.has(category.name)) {
            const alternative = categories.find(c => c.name === category.alternativeGroup);
            if (alternative) {
                alternativePairs.push([category, alternative]);
                alternativeGroupNames.add(category.name);
                alternativeGroupNames.add(alternative.name);
                processedAlternatives.add(category.name);
                processedAlternatives.add(alternative.name);
            }
        }
    }

    // Separate groups: single-var, multi-var, and alternatives
    const singleVarGroups = categories.filter(c => 
        c.variables.length === 1 && !alternativeGroupNames.has(c.name)
    );
    const multiVarGroups = categories.filter(c => 
        c.variables.length > 1 && !alternativeGroupNames.has(c.name)
    );
    
    console.error('DEBUG: singleVarGroups:', singleVarGroups.map(g => g.name));
    console.error('DEBUG: alternativeGroupNames:', Array.from(alternativeGroupNames));
    
    // First, handle alternative groups (user must pick one)
    console.error('DEBUG: alternativePairs.length =', alternativePairs.length);
    for (const alternatives of alternativePairs) {
        console.error('DEBUG: Processing alternatives:', alternatives.map(a => a.name));
        store.updateData('alternativeGroups', alternatives);
        store.setStatus('Choose an AI provider...');

        const result = await store.waitForInput('env_alternatives') as { 
            selectedGroup: string; 
            values: Record<string, string>;
        };

        // Add values from the selected alternative
        for (const [key, value] of Object.entries(result.values)) {
            if (value) {
                envValues[key] = value;
            }
        }
    }

    // Auto-apply infrastructure defaults (Docker services) without prompting
    const infraVars = envParser.getInfrastructureVariables();
    for (const varName of infraVars) {
        const defaultVal = envParser.getDefaultValue(varName, setupMode);
        if (defaultVal) {
            envValues[varName] = defaultVal;
        }
    }

    // Then, handle single-variable groups one at a time
    // Skip infrastructure variables that already have defaults applied
    const singleVars = singleVarGroups.flatMap(c => c.variables)
        .filter(v => !infraVars.includes(v.name));
    // Sort: required first
    const sortedSingleVars = [...singleVars].sort((a, b) => {
        if (a.required && !b.required) return -1;
        if (!a.required && b.required) return 1;
        return 0;
    });
    
    store.updateData('envVarTotal', sortedSingleVars.length);

    for (let i = 0; i < sortedSingleVars.length; i++) {
        const envVar = sortedSingleVars[i];
        if (!envVar) continue;
        
        store.updateData('currentEnvVar', envVar);
        store.updateData('envVarIndex', i);
        store.setStatus(`Configuring ${envVar.name}...`);

        const value = await store.waitForInput('env_var', { varName: envVar.name }) as string;

        // Only add if value is provided or it's required
        if (value || envVar.required) {
            envValues[envVar.name] = value || envVar.defaultValue || '';
        }
    }
    
    // Finally, handle multi-variable groups (show all vars in group at once)
    // Skip groups where all variables are infrastructure variables
    const sortedMultiVarGroups = [...multiVarGroups]
        .filter(g => !g.variables.every(v => infraVars.includes(v.name)))
        .sort((a, b) => {
            const aHasRequired = a.variables.some(v => v.required);
            const bHasRequired = b.variables.some(v => v.required);
            if (aHasRequired && !bHasRequired) return -1;
            if (!aHasRequired && bHasRequired) return 1;
            return 0;
        });
    
    store.updateData('envGroupTotal', sortedMultiVarGroups.length);

    for (let i = 0; i < sortedMultiVarGroups.length; i++) {
        const group = sortedMultiVarGroups[i];
        if (!group) continue;
        
        store.updateData('currentEnvGroup', group);
        store.updateData('envGroupIndex', i);
        store.setStatus(`Configuring ${group.name}...`);

        const groupValues = await store.waitForInput('env_group', { groupName: group.name }) as Record<string, string>;

        // Add all values from the group
        for (const [key, value] of Object.entries(groupValues)) {
            const varDef = group.variables.find(v => v.name === key);
            if (value || varDef?.required) {
                envValues[key] = value || varDef?.defaultValue || '';
            }
        }
        }

        // Write .env file to apps/api/
        store.setStatus('Writing API environment file...');
        try {
            const apiEnvPath = path.join(repoPath, 'apps', 'api');
            envWriter.writeEnvFile(apiEnvPath, envValues);
            store.setStatus('API environment variables configured!');
        } catch (e) {
            store.setError(new Error(`Failed to write API .env file: ${(e as Error).message}`));
            return;
        }
        
        // Write web .env file (just the backend URL)
        store.setStatus('Writing web environment file...');
        try {
            const webEnvPath = path.join(repoPath, 'apps', 'web');
            const apiBaseUrl = setupMode === 'selfhost' 
                ? 'http://localhost:8000/api/v1/'
                : 'http://localhost:8000/api/v1/';
            envWriter.writeEnvFile(webEnvPath, {
                'NEXT_PUBLIC_API_BASE_URL': apiBaseUrl
            });
            store.setStatus('Web environment variables configured!');
        } catch (e) {
            store.setError(new Error(`Failed to write web .env file: ${(e as Error).message}`));
            return;
        }

        await delay(1000);
    } // End of manual setup else block

    // 4. Install Dependencies via mise setup
    store.setStep('Dependencies');
    store.updateData('dependencyPhase', 'Initializing mise...');
    store.updateData('dependencyProgress', 0);
    store.updateData('dependencyComplete', false);
    store.updateData('repoPath', repoPath);

    try {
        // Trust mise config
        store.updateData('dependencyPhase', 'Trusting mise configuration...');
        await runCommand('mise', ['trust'], repoPath);
        store.updateData('dependencyProgress', 10);
        
        // Install mise tools (node, python, uv, nx, etc.)
        store.updateData('dependencyPhase', 'Installing tools (node, python, uv, nx)...');
        await runCommand('mise', ['install'], repoPath, (progress) => {
            store.updateData('dependencyProgress', 10 + progress * 0.3); // 10-40%
        });
        
        store.updateData('dependencyProgress', 40);
        store.updateData('dependencyPhase', 'Running mise setup (all dependencies)...');
        
        // Run mise setup - handles pnpm install, uv sync, Docker, seeding
        await runCommand('mise', ['setup'], repoPath, (progress) => {
            store.updateData('dependencyProgress', 40 + progress * 0.6); // 40-100%
        });
        
        store.updateData('dependencyProgress', 100);
        store.updateData('dependencyPhase', 'Setup complete!');
        store.updateData('dependencyComplete', true);
    } catch (e) {
        store.setError(new Error(`Failed to install dependencies: ${(e as Error).message}`));
        return;
    }

    await delay(1000);

    // 5. Start Services prompt
    store.setStep('Start Services');
    store.setStatus('Ready to start GAIA');
    
    const startChoice = await store.waitForInput('start_services') as string;

    if (startChoice === 'start') {
        // User chose to start services
        store.setStatus('Starting GAIA...');
        
        try {
            if (setupMode === 'selfhost') {
                // Self-host mode: Use mise dev:full to start everything
                // This starts: Docker services + API + web + arq worker + voice agent
                store.setStatus('Starting all services (mise dev:full)...');
                await runCommand('mise', ['dev:full'], repoPath);
                store.setStatus('All services started!');
            } else {
                // Developer mode: Use mise dev (starts Docker + API + web)
                store.setStatus('Starting development servers (mise dev)...');
                await runCommand('mise', ['dev'], repoPath);
            }
            
            await delay(1000);
            
            // Show running state
            store.setStatus('GAIA is running! 🚀');
            await store.waitForInput('services_running');
            
        } catch (e) {
            store.setError(new Error(`Failed to start services: ${(e as Error).message}`));
            return;
        }
    } else {
        // User chose to skip - show manual commands
        await store.waitForInput('manual_commands');
    }

    // Exit
    store.setStep('Finished');
    store.setStatus('Setup complete!');
}

/**
 * Runs a command and returns a promise that resolves when complete.
 * @param cmd - Command to run
 * @param args - Arguments for the command
 * @param cwd - Working directory
 * @param onProgress - Optional progress callback (0-100)
 */
async function runCommand(
    cmd: string, 
    args: string[], 
    cwd: string,
    onProgress?: (progress: number) => void
): Promise<void> {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { 
            cwd, 
            stdio: ['inherit', 'pipe', 'pipe'],
            shell: true 
        });
        
        let output = '';
        let progress = 0;
        
        proc.stdout?.on('data', (data) => {
            output += data.toString();
            // Estimate progress based on output length
            progress = Math.min(progress + 5, 95);
            onProgress?.(progress);
        });
        
        proc.stderr?.on('data', (data) => {
            output += data.toString();
        });
        
        proc.on('close', (code) => {
            if (code === 0) {
                onProgress?.(100);
                resolve();
            } else {
                reject(new Error(`Command failed with code ${code}: ${output.slice(-500)}`));
            }
        });
        
        proc.on('error', (err) => {
            reject(err);
        });
    });
}
