import simpleGit from 'simple-git';
import fs from 'fs';

export async function setupRepo(
  targetDir: string, 
  repoUrl: string, 
  onProgress: (progress: number) => void
): Promise<void> {
  const git = simpleGit();

  if (fs.existsSync(targetDir)) {
    onProgress(100); // Already exists, treating as instant success for now
    await git.cwd(targetDir).pull();
  } else {
    // Fake progress for clone as simple-git progress is tricky in this context
    let p = 0;
    const interval = setInterval(() => {
        p += 10;
        if (p > 90) p = 90;
        onProgress(p);
    }, 500);

    try {
        await git.clone(repoUrl, targetDir);
        clearInterval(interval);
        onProgress(100);
    } catch (e) {
        clearInterval(interval);
        throw e;
    }
  }
}
