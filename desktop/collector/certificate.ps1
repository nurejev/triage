function Read-TriageCertificate($Credential) {
    try {
        $bytes=[Convert]::FromBase64String([string]$Credential.pfx)
        # macOS rejects EphemeralKeySet. DefaultKeySet uses OS-managed temporary keys;
        # Dispose releases them. Never request PersistKeySet.
        $flags=if($IsMacOS){[Security.Cryptography.X509Certificates.X509KeyStorageFlags]::DefaultKeySet}else{[Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet}
        $cert=[Security.Cryptography.X509Certificates.X509Certificate2]::new($bytes,[string]$Credential.password,$flags)
        if(!$cert.HasPrivateKey){throw 'No private key'}
        if($cert.NotAfter.ToUniversalTime() -le [datetime]::UtcNow -or $cert.NotBefore.ToUniversalTime() -gt [datetime]::UtcNow){throw 'Certificate is expired or not yet valid'}
        return $cert
    } catch { throw 'The PFX certificate cannot be used. Check its password, private key and validity dates.' }
}
