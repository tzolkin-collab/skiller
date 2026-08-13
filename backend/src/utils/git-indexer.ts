import crypto from 'crypto';

export interface FlatFile {
  path: string;
  content: string;
}

export interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  sha?: string;
  children?: TreeNode[];
}

export interface GitPackage {
  root: TreeNode;
  blobs: Record<string, { content: string }>;
}

function calculateSha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function buildGitPackage(files: FlatFile[]): GitPackage {
  const blobs: Record<string, { content: string }> = {};
  
  const root: TreeNode = {
    name: 'root',
    type: 'directory',
    children: []
  };

  for (const file of files) {
    const sha = calculateSha256(file.content);
    if (!blobs[sha]) {
      blobs[sha] = { content: file.content };
    }

    // Split path into segments, e.g. "modules/auth.md" -> ["modules", "auth.md"]
    // Normalize path separators first
    const cleanPath = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
    const segments = cleanPath.split('/');
    
    let currentNode = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isFile = i === segments.length - 1;

      if (!currentNode.children) {
        currentNode.children = [];
      }

      let childNode = currentNode.children.find(c => c.name === segment);

      if (!childNode) {
        if (isFile) {
          childNode = {
            name: segment,
            type: 'file',
            sha
          };
        } else {
          childNode = {
            name: segment,
            type: 'directory',
            children: []
          };
        }
        currentNode.children.push(childNode);
      }

      currentNode = childNode;
    }
  }

  // Optional: Sort children alphabetically, directories first
  function sortTree(node: TreeNode) {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      for (const child of node.children) {
        sortTree(child);
      }
    }
  }

  sortTree(root);

  return { root, blobs };
}
