import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { createHash } from "crypto";

const PROGRAM_ID = new PublicKey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEtYHKKH9YTSvxRN");

function pad32(label: string): number[] {
  const buf = Buffer.alloc(32);
  buf.write(label.slice(0, 32));
  return Array.from(buf);
}

function experienceRoot(
  ipfs: string,
  arweave: string,
  experienceId: number[]
): number[] {
  const h = createHash("sha256");
  h.update(Buffer.from(ipfs));
  h.update(Buffer.from(arweave));
  h.update(Buffer.from(experienceId));
  return Array.from(h.digest());
}

describe("agape phase 0", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(
    require("../target/idl/agape.json"),
    PROGRAM_ID,
    provider
  ) as Program;

  const creator = provider.wallet as anchor.Wallet;
  const estateName = pad32("kevan.estate");
  const experienceId = pad32("exp-skill-001");

  let estatePda: PublicKey;
  let experiencePda: PublicKey;

  before(async () => {
    [estatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("estate"), creator.publicKey.toBuffer(), Buffer.from(estateName)],
      PROGRAM_ID
    );
    [experiencePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("experience"),
        estatePda.toBuffer(),
        Buffer.from(experienceId),
      ],
      PROGRAM_ID
    );
  });

  it("register_estate", async () => {
    await program.methods
      .registerEstate(estateName)
      .accounts({
        creator: creator.publicKey,
        estateRegistry: estatePda,
        parentEstate: null,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const estate = await program.account.estateRegistry.fetch(estatePda);
    expect(estate.creator.toBase58()).to.equal(creator.publicKey.toBase58());
    expect(estate.lineageIndex.toNumber()).to.equal(0);
  });

  it("commit_experience", async () => {
    const ipfs = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const arweave = "arweave-tx-id-phase0-demo";
    const rootHash = experienceRoot(ipfs, arweave, experienceId);

    await program.methods
      .commitExperience({
        ipfsCid: ipfs,
        arweaveTxId: arweave,
        experienceId,
        contentClass: { skill: {} },
        metadataUri: "ipfs://agape/metadata/exp-skill-001.json",
        rootHash,
      })
      .accounts({
        creator: creator.publicKey,
        estateRegistry: estatePda,
        experienceCommitment: experiencePda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const exp = await program.account.experienceCommitment.fetch(experiencePda);
    expect(exp.memorialLocked).to.equal(false);
    expect(Buffer.from(exp.rootHash)).to.deep.equal(Buffer.from(rootHash));
  });

  it("lock_memorial", async () => {
    await program.methods
      .lockMemorial(experienceId)
      .accounts({
        creator: creator.publicKey,
        estateRegistry: estatePda,
        experienceCommitment: experiencePda,
      })
      .rpc();

    const exp = await program.account.experienceCommitment.fetch(experiencePda);
    expect(exp.memorialLocked).to.equal(true);
  });
});

/** Phase 1 — Rights Stream: 60/20/20 default, atomic vault routing */
describe("agape rights stream (phase 1)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(
    require("../target/idl/agape.json"),
    PROGRAM_ID,
    provider
  ) as Program;

  const creator = provider.wallet as anchor.Wallet;
  const estateName = pad32("rights.stream.estate");
  const DEFAULT_CREATOR_BPS = 6000;
  const DEFAULT_INFRA_BPS = 2000;
  const DEFAULT_FAMILY_BPS = 2000;

  let estatePda: PublicKey;
  let rightsPda: PublicKey;
  let creatorVaultPda: PublicKey;
  let infraPoolPda: PublicKey;
  let familyVaultPda: PublicKey;

  const infraOperator = anchor.web3.Keypair.generate().publicKey;
  const familyTrustee = anchor.web3.Keypair.generate().publicKey;

  before(async () => {
    [estatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("estate"), creator.publicKey.toBuffer(), Buffer.from(estateName)],
      PROGRAM_ID
    );
    [rightsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("rights"), estatePda.toBuffer()],
      PROGRAM_ID
    );
    [creatorVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("creator_vault"), estatePda.toBuffer()],
      PROGRAM_ID
    );
    [infraPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("infra_pool"), estatePda.toBuffer()],
      PROGRAM_ID
    );
    [familyVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("legacy_trust"), estatePda.toBuffer()],
      PROGRAM_ID
    );

    await program.methods
      .registerEstate(estateName)
      .accounts({
        creator: creator.publicKey,
        estateRegistry: estatePda,
        parentEstate: null,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("initialize_creator_vault", async () => {
    await program.methods
      .initializeCreatorVault(infraOperator, familyTrustee)
      .accounts({
        creator: creator.publicKey,
        estateRegistry: estatePda,
        creatorVault: creatorVaultPda,
        infraPool: infraPoolPda,
        familyTrustVault: familyVaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vault = await program.account.creatorVault.fetch(creatorVaultPda);
    expect(vault.withdrawAuthority.toBase58()).to.equal(
      creator.publicKey.toBase58()
    );
    expect(vault.estate.toBase58()).to.equal(estatePda.toBase58());
  });

  it("initialize_rights_template default 60/20/20", async () => {
    await program.methods
      .initializeRightsTemplate(
        DEFAULT_CREATOR_BPS,
        DEFAULT_INFRA_BPS,
        DEFAULT_FAMILY_BPS
      )
      .accounts({
        creator: creator.publicKey,
        estateRegistry: estatePda,
        rightsTemplate: rightsPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const tpl = await program.account.rightsTemplate.fetch(rightsPda);
    expect(tpl.creatorBps).to.equal(DEFAULT_CREATOR_BPS);
    expect(tpl.infrastructureBps).to.equal(DEFAULT_INFRA_BPS);
    expect(tpl.familyTrustBps).to.equal(DEFAULT_FAMILY_BPS);
    expect(
      tpl.creatorBps + tpl.infrastructureBps + tpl.familyTrustBps
    ).to.equal(10000);
  });

  it("execute_rights_payment routes lamports atomically", async () => {
    const amount = new anchor.BN(1_000_000);

    const vaultBefore = await provider.connection.getBalance(creatorVaultPda);
    const infraBefore = await provider.connection.getBalance(infraPoolPda);
    const familyBefore = await provider.connection.getBalance(familyVaultPda);

    await program.methods
      .executeRightsPayment(amount)
      .accounts({
        payer: creator.publicKey,
        estateRegistry: estatePda,
        rightsTemplate: rightsPda,
        creatorVault: creatorVaultPda,
        infraPool: infraPoolPda,
        familyTrustVault: familyVaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const vaultAfter = await provider.connection.getBalance(creatorVaultPda);
    const infraAfter = await provider.connection.getBalance(infraPoolPda);
    const familyAfter = await provider.connection.getBalance(familyVaultPda);

    expect(vaultAfter - vaultBefore).to.equal(600_000);
    expect(infraAfter - infraBefore).to.equal(200_000);
    expect(familyAfter - familyBefore).to.equal(200_000);
  });

  it("withdraw_creator_vault stub", async () => {
    const withdrawAmount = new anchor.BN(100_000);
    const destBefore = await provider.connection.getBalance(creator.publicKey);

    await program.methods
      .withdrawCreatorVault(withdrawAmount)
      .accounts({
        withdrawAuthority: creator.publicKey,
        estateRegistry: estatePda,
        creatorVault: creatorVaultPda,
        destination: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const destAfter = await provider.connection.getBalance(creator.publicKey);
    expect(destAfter).to.be.greaterThan(destBefore);
  });
});
