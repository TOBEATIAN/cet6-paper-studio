$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct ModelNativeCredential
{
    public UInt32 Flags;
    public UInt32 Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
}

public static class ModelNativeCredentials
{
    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);

    [DllImport("advapi32.dll", EntryPoint = "CredFree")]
    public static extern void CredFree(IntPtr credential);
}
"@

$target = "e1d0e7e5-1496-43d0-836a-ed25a5243ecb.com.cet6.paperstudio"
$pointer = [IntPtr]::Zero
if (-not [ModelNativeCredentials]::CredRead($target, 1, 0, [ref]$pointer)) {
    throw "Could not read the DeepSeek credential."
}

try {
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
        $pointer,
        [type][ModelNativeCredential]
    )
    $bytes = New-Object byte[] $credential.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy(
        $credential.CredentialBlob,
        $bytes,
        0,
        $bytes.Length
    )
    $apiKey = [Text.Encoding]::Unicode.GetString($bytes)
} finally {
    [ModelNativeCredentials]::CredFree($pointer)
}

$response = Invoke-RestMethod `
    -Uri "https://api.deepseek.com/models" `
    -Headers @{ Authorization = "Bearer $apiKey" } `
    -TimeoutSec 60
$response.data | Select-Object id,owned_by | Format-Table -AutoSize
