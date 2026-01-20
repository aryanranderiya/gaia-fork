import { execa } from 'execa';

export type CheckResult = 'success' | 'error' | 'missing' | 'pending';

export async function checkGit(): Promise<CheckResult> {
  try {
    await execa('git', ['--version']);
    return 'success';
  } catch {
    return 'error';
  }
}

export async function checkDocker(): Promise<CheckResult> {
  try {
    await execa('docker', ['--version']);
    return 'success';
  } catch {
    return 'error';
  }
}

export async function checkMise(): Promise<CheckResult> {
  try {
    await execa('mise', ['--version']);
    return 'success';
  } catch {
    return 'missing';
  }
}

export async function installMise(): Promise<boolean> {
  try {
    await execa('sh', ['-c', 'curl https://mise.jdx.dev/install.sh | sh']);
    return true;
  } catch {
    return false;
  }
}
