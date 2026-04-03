// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title  FTH USD Stablecoin (FTH_USD)
/// @notice Owner-mintable ERC-20 stablecoin for the FTH Trading ecosystem.
///         Deployed across Avalanche, Polygon, Base, and Ethereum.
///
/// Features:
///   - Owner can mint new tokens (treasury issuance)
///   - Any holder can burn their own tokens (redemption)
///   - ERC-2612 Permit for gasless approvals
///   - Minter role for authorized issuance controllers
///   - Pause capability via owner for emergency stops
///
/// @dev    6 decimals to match USDC/USDT conventions.
///         Owner is the FTH Treasury multi-sig or operator wallet.
contract FTHStablecoin is ERC20, ERC20Burnable, Ownable, ERC20Permit {

    uint8 private constant _DECIMALS = 6;

    /// @notice Addresses authorized to mint (treasury controllers, issuance API)
    mapping(address => bool) public minters;

    /// @notice Emergency pause flag
    bool public paused;

    // ── Events ────────────────────────────────────────────────────────────────
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ── Errors ────────────────────────────────────────────────────────────────
    error NotMinter();
    error ContractPaused();

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyMinter() {
        if (!minters[msg.sender] && msg.sender != owner()) revert NotMinter();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    /// @param initialOwner Address set as owner — can mint, add minters, pause
    constructor(address initialOwner)
        ERC20("FTH USD", "FTH_USD")
        Ownable(initialOwner)
        ERC20Permit("FTH USD")
    {
        minters[initialOwner] = true;
    }

    // ── ERC-20 overrides ──────────────────────────────────────────────────────

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    // ── Minting ───────────────────────────────────────────────────────────────

    /// @notice Mint new FTH_USD tokens. Only callable by minters or owner.
    /// @param to     Recipient address
    /// @param amount Amount in smallest units (6 decimals)
    function mint(address to, uint256 amount) external onlyMinter whenNotPaused {
        _mint(to, amount);
    }

    /// @notice Batch mint to multiple recipients in a single transaction.
    /// @param recipients Array of addresses to mint to
    /// @param amounts    Array of amounts (must match recipients length)
    function batchMint(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyMinter whenNotPaused {
        require(recipients.length == amounts.length, "Length mismatch");
        require(recipients.length <= 100, "Batch too large");
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
        }
    }

    // ── Minter management ─────────────────────────────────────────────────────

    /// @notice Add an authorized minter address.
    function addMinter(address minter) external onlyOwner {
        minters[minter] = true;
        emit MinterAdded(minter);
    }

    /// @notice Remove a minter address.
    function removeMinter(address minter) external onlyOwner {
        minters[minter] = false;
        emit MinterRemoved(minter);
    }

    // ── Pause ─────────────────────────────────────────────────────────────────

    /// @notice Emergency pause — stops all minting and transfers.
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Resume normal operations.
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ── Transfer override (pausable) ──────────────────────────────────────────

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override whenNotPaused {
        super._update(from, to, value);
    }
}
