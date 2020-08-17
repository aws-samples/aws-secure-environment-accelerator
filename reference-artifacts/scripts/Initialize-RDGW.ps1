[CmdletBinding()]
param (
    [Parameter(Mandatory=$true)]
    [string]$ServerFQDN,

    [Parameter(Mandatory=$true)]
    [string]$DomainNetBiosName,

    [Parameter(Mandatory=$true)]
    [string]$GroupName,

    [Parameter(Mandatory=$false)]
    [string]$KeyLength='2048'
)

try {
    $ErrorActionPreference = "Stop"

    Start-Transcript -Path c:\cfn\log\Initialize-RDGW.ps1.txt -Append

    Import-Module remotedesktopservices

    $name = new-object -com "X509Enrollment.CX500DistinguishedName.1"
    $name.Encode("CN=$ServerFQDN", 0)

    $key = new-object -com "X509Enrollment.CX509PrivateKey.1"
    $key.ProviderName = "Microsoft RSA SChannel Cryptographic Provider"
    $key.KeySpec = 1
    $key.Length = $KeyLength
    $key.SecurityDescriptor = "D:PAI(A;;0xd01f01ff;;;SY)(A;;0xd01f01ff;;;BA)(A;;0x80120089;;;NS)"
    $key.MachineContext = 1
    $key.Create()

    $serverauthoid = new-object -com "X509Enrollment.CObjectId.1"
    $serverauthoid.InitializeFromValue("1.3.6.1.5.5.7.3.1")
    $ekuoids = new-object -com "X509Enrollment.CObjectIds.1"
    $ekuoids.add($serverauthoid)
    $ekuext = new-object -com "X509Enrollment.CX509ExtensionEnhancedKeyUsage.1"
    $ekuext.InitializeEncode($ekuoids)

    $cert = new-object -com "X509Enrollment.CX509CertificateRequestCertificate.1"
    $cert.InitializeFromPrivateKey(2, $key, "")
    $cert.Subject = $name
    $cert.Issuer = $cert.Subject
    $cert.NotBefore = get-date
    $cert.NotAfter = $cert.NotBefore.AddDays(730)
    $cert.X509Extensions.Add($ekuext)
    $cert.Encode()

    $enrollment = new-object -com "X509Enrollment.CX509Enrollment.1"
    $enrollment.InitializeFromRequest($cert)
    $certdata = $enrollment.CreateRequest(0)
    $enrollment.InstallResponse(2, $certdata, 0, "")

    dir cert:\localmachine\my | ? { $_.Subject -eq "CN=$ServerFQDN" } | % { [system.IO.file]::WriteAllBytes("c:\$env:COMPUTERNAME.cer", ($_.Export('CERT', 'secret')) ) }

    new-item -path RDS:\GatewayServer\CAP -Name Default-CAP -UserGroups "$GroupName@$DomainNetBiosName" -AuthMethod 1

    new-item -Path RDS:\GatewayServer\RAP -Name Default-RAP -UserGroups "$GroupName@$DomainNetBiosName" -ComputerGroupType 2

    dir cert:\localmachine\my | where-object { $_.Subject -eq "CN=$ServerFQDN" } | ForEach-Object { Set-Item -Path RDS:\GatewayServer\SSLCertificate\Thumbprint -Value $_.Thumbprint }

    Restart-Service tsgateway
}
catch {
    Write-Verbose "$($_.exception.message)@ $(Get-Date)"
    $_ | Write-AWSQuickStartException
}
