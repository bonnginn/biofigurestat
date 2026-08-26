use sha2::{Digest, Sha256};

#[tauri::command]
pub fn sha256_bytes(data: Vec<u8>) -> String {
    let digest = Sha256::digest(data);
    format!("{digest:x}")
}

#[cfg(test)]
mod tests {
    use super::sha256_bytes;

    #[test]
    fn returns_the_standard_sha256_digest() {
        assert_eq!(
            sha256_bytes(b"abc".to_vec()),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
