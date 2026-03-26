//! Cryptographic operations — Ed25519 keygen, sign, verify.

use ed25519_dalek::{Signer, SigningKey, VerifyingKey, Signature, Verifier};
use rand::rngs::OsRng;

/// Generate an Ed25519 keypair. Returns (public_key_hex, private_key_hex).
pub fn generate_ed25519() -> (String, String) {
    let signing_key = SigningKey::generate(&mut OsRng);
    let verifying_key: VerifyingKey = (&signing_key).into();

    let private_hex = hex::encode(signing_key.to_bytes());
    let public_hex = hex::encode(verifying_key.to_bytes());

    (public_hex, private_hex)
}

/// Sign data with an Ed25519 private key. Returns signature hex.
pub fn sign_ed25519(data: &[u8], private_key_hex: &str) -> Result<String, String> {
    let key_bytes = hex::decode(private_key_hex).map_err(|e| format!("bad hex: {e}"))?;
    let key_arr: [u8; 32] = key_bytes
        .try_into()
        .map_err(|_| "private key must be 32 bytes".to_string())?;

    let signing_key = SigningKey::from_bytes(&key_arr);
    let signature: Signature = signing_key.sign(data);
    Ok(hex::encode(signature.to_bytes()))
}

/// Verify an Ed25519 signature. Returns true if valid.
pub fn verify_ed25519(data: &[u8], signature_hex: &str, public_key_hex: &str) -> Result<bool, String> {
    let pub_bytes = hex::decode(public_key_hex).map_err(|e| format!("bad public hex: {e}"))?;
    let pub_arr: [u8; 32] = pub_bytes
        .try_into()
        .map_err(|_| "public key must be 32 bytes".to_string())?;

    let sig_bytes = hex::decode(signature_hex).map_err(|e| format!("bad signature hex: {e}"))?;
    let sig_arr: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| "signature must be 64 bytes".to_string())?;

    let verifying_key = VerifyingKey::from_bytes(&pub_arr)
        .map_err(|e| format!("invalid public key: {e}"))?;
    let signature = Signature::from_bytes(&sig_arr);

    Ok(verifying_key.verify(data, &signature).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keygen_sign_verify() {
        let (pub_hex, priv_hex) = generate_ed25519();
        assert_eq!(pub_hex.len(), 64);
        assert_eq!(priv_hex.len(), 64);

        let data = b"hello world";
        let sig = sign_ed25519(data, &priv_hex).unwrap();
        assert_eq!(sig.len(), 128);

        let valid = verify_ed25519(data, &sig, &pub_hex).unwrap();
        assert!(valid);

        // tamper detection
        let tampered = verify_ed25519(b"tampered", &sig, &pub_hex).unwrap();
        assert!(!tampered);
    }

    #[test]
    fn test_wrong_key_rejection() {
        let (_pub1, priv1) = generate_ed25519();
        let (pub2, _priv2) = generate_ed25519();

        let data = b"secret message";
        let sig = sign_ed25519(data, &priv1).unwrap();
        let valid = verify_ed25519(data, &sig, &pub2).unwrap();
        assert!(!valid);
    }
}
