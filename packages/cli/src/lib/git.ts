import { execa } from 'execa';
import simpleGit from 'simple-git';
import fs from 'fs';

export interface CloneProgress {
  progress: number;
  phase: 'counting' | 'compressing' | 'receiving' | 'resolving' | 'complete';
  details?: string;
}

export async function setupRepo(
  targetDir: string, 
  repoUrl: string, 
  onProgress: (progress: number, phase?: string) => void
): Promise<void> {
  if (fs.existsSync(targetDir)) {
    onProgress(100); // Already exists
    const git = simpleGit();
    await git.cwd(targetDir).pull();
  } else {
    // Use execa to run git with progress output
    const gitProcess = execa('git', ['clone', '--progress', repoUrl, targetDir]);
    
    // Git progress is written to stderr
    gitProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      
      // Check for different phases
      if (output.includes('Counting objects')) {
        onProgress(5, 'Counting objects');
      } else if (output.includes('Compressing objects')) {
        onProgress(10, 'Compressing objects');
      }
      
      // Parse git progress output
      // Format: "Receiving objects: XX% (N/M)"
      const receivingMatch = output.match(/Receiving objects:\s+(\d+)%\s+\((\d+)\/(\d+)\)/);
      if (receivingMatch?.[1]) {
        const percent = Math.min(100, parseInt(receivingMatch[1], 10));
        const current = receivingMatch[2];
        const total = receivingMatch[3];
        // Receiving is 10-60% of total progress
        onProgress(10 + Math.floor(percent * 0.5), `Receiving objects: ${current}/${total}`);
      }
      
      // Format: "Resolving deltas: XX% (N/M)"
      const resolvingMatch = output.match(/Resolving deltas:\s+(\d+)%\s+\((\d+)\/(\d+)\)/);
      if (resolvingMatch?.[1]) {
        const percent = Math.min(100, parseInt(resolvingMatch[1], 10));
        const current = resolvingMatch[2];
        const total = resolvingMatch[3];
        // Resolving is 60-100% of total progress
        onProgress(60 + Math.floor(percent * 0.4), `Resolving deltas: ${current}/${total}`);
      }
    });
    
    await gitProcess;
    onProgress(100, 'Clone complete');
  }
}
