import { CLIStore } from '../../ui/store.js';
import * as prereqs from '../../lib/prerequisites.js';
import * as git from '../../lib/git.js';

import * as fs from 'fs';

export async function runInitFlow(store: CLIStore) {
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

    await new Promise(r => setTimeout(r, 800)); // Minimal delay for UX

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

    await new Promise(r => setTimeout(r, 1000));

    let repoPath = '';
    while (true) {
        repoPath = await store.waitForInput('repo_path', { default: './gaia' });
        if (fs.existsSync(repoPath)) {
            const stat = fs.statSync(repoPath);
            if (!stat.isDirectory()) {
                 store.setError(new Error(`Path ${repoPath} exists and is not a directory.`));
                 await new Promise(r => setTimeout(r, 2000));
                 store.setError(null);
                 continue;
            }
            
            const files = fs.readdirSync(repoPath);
            if (files.length > 0) {
                store.setError(new Error(`Directory ${repoPath} is not empty. Please choose another path.`));
                await new Promise(r => setTimeout(r, 2000));
                store.setError(null); // Clear error
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

    await new Promise(r => setTimeout(r, 1000));

    // 3. Finish
    store.setStep('Finished');
    store.setStatus('Setup complete!');
    await store.waitForInput('finish');
}
