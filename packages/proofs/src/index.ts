/**
 * @unykorn/proofs — Merkle Tree Builder, Proof Generation & Verification
 *
 * Builds Merkle trees from arbitrary leaf data, generates inclusion proofs,
 * and verifies proofs against a known root. Uses SHA-256 hashing.
 */

import { createHash } from "node:crypto";
import type { MerkleNode, MerkleTree, MerkleProof } from "@unykorn/shared-types";

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hashPair(left: string, right: string): string {
  return sha256(left + right);
}

function nextPowerOf2(n: number): number {
  let v = 1;
  while (v < n) v <<= 1;
  return v;
}

// ═══════════════════════════════════════════════════════════
// Merkle Tree Builder
// ═══════════════════════════════════════════════════════════

export class MerkleTreeBuilder {
  private static readonly EMPTY_LEAF = sha256("merkle:empty");

  /**
   * Build a Merkle tree from raw leaf data (strings).
   * Each leaf is SHA-256 hashed before tree construction.
   */
  buildFromData(data: string[]): MerkleTree {
    if (data.length === 0) {
      throw new Error("Cannot build Merkle tree from empty data");
    }
    const leafHashes = data.map((d) => sha256(d));
    return this.buildFromHashes(leafHashes);
  }

  /**
   * Build a Merkle tree from pre-hashed leaves.
   */
  buildFromHashes(leafHashes: string[]): MerkleTree {
    if (leafHashes.length === 0) {
      throw new Error("Cannot build Merkle tree from empty leaves");
    }

    const originalCount = leafHashes.length;
    const paddedSize = nextPowerOf2(originalCount);

    // Pad with empty leaves
    const leaves = [...leafHashes];
    while (leaves.length < paddedSize) {
      leaves.push(MerkleTreeBuilder.EMPTY_LEAF);
    }

    const allNodes: MerkleNode[] = [];
    let level = 0;

    // Create leaf nodes
    let currentLevel: MerkleNode[] = leaves.map((hash, idx) => {
      const node: MerkleNode = {
        hash,
        left: null,
        right: null,
        data: hash,
        index: idx,
        level,
      };
      allNodes.push(node);
      return node;
    });

    // Build parent levels
    while (currentLevel.length > 1) {
      level++;
      const nextLevel: MerkleNode[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const lNode = currentLevel[i];
        const rNode = currentLevel[i + 1];
        const pHash = hashPair(lNode.hash, rNode.hash);
        const parent: MerkleNode = {
          hash: pHash,
          left: lNode.hash,
          right: rNode.hash,
          data: null,
          index: Math.floor(i / 2),
          level,
        };
        allNodes.push(parent);
        nextLevel.push(parent);
      }
      currentLevel = nextLevel;
    }

    return {
      root: currentLevel[0].hash,
      leaves,
      nodes: allNodes,
      depth: level,
      leafCount: originalCount,
    };
  }

  /**
   * Generate an inclusion proof for a leaf at the given index.
   */
  generateProof(tree: MerkleTree, leafIndex: number): MerkleProof {
    if (leafIndex < 0 || leafIndex >= tree.leaves.length) {
      throw new Error(`Leaf index ${leafIndex} out of range [0, ${tree.leaves.length})`);
    }

    const siblings: string[] = [];
    const directions: boolean[] = [];

    // Walk from leaf to root collecting siblings
    let idx = leafIndex;
    const leafNodes = tree.nodes.filter((n) => n.level === 0);
    let currentLevelNodes = leafNodes;

    for (let lvl = 0; lvl < tree.depth; lvl++) {
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;

      if (siblingIdx < currentLevelNodes.length) {
        siblings.push(currentLevelNodes[siblingIdx].hash);
        directions.push(isRight);
      }

      idx = Math.floor(idx / 2);
      const nextLvl = lvl + 1;
      currentLevelNodes = tree.nodes.filter((n) => n.level === nextLvl);
    }

    return {
      leafHash: tree.leaves[leafIndex],
      leafIndex,
      siblings,
      directions,
      root: tree.root,
    };
  }

  /**
   * Verify a Merkle proof against a root hash.
   */
  verifyProof(proof: MerkleProof): boolean {
    let current = proof.leafHash;

    for (let i = 0; i < proof.siblings.length; i++) {
      const sibling = proof.siblings[i];
      const isRight = proof.directions[i];

      if (isRight) {
        // Current node is on the right → sibling is left
        current = hashPair(sibling, current);
      } else {
        // Current node is on the left → sibling is right
        current = hashPair(current, sibling);
      }
    }

    return current === proof.root;
  }

  /**
   * Hash raw data to a leaf hash (convenience).
   */
  hashLeaf(data: string): string {
    return sha256(data);
  }
}
