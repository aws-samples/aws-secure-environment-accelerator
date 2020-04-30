[CmdletBinding()]
param (
    [Parameter(Mandatory=$true)]
    [string[]]$EIPs
)

try {
    $ErrorActionPreference = "Stop"

    Start-Transcript -Path c:\cfn\log\Set-EIP.ps1.txt -Append

    # Sanitize allowed EIPs to be used from list passed
    $allowedEIPs = $EIPs | ? { $PSItem -ne 'Null' }

    # Determine current region
    $region = (Invoke-RestMethod http://169.254.169.254/latest/dynamic/instance-identity/document).region

    # Get instance private IP address
    $privateIP = (Test-Connection -ComputerName $env:COMPUTERNAME -Count 1).IPV4Address.IPAddressToString

    # Get assigned EIP addresses
    $assignedEIP = Get-EC2Address -Region $region | ? { $PSItem.PublicIp -in $allowedEIPs -and $PSItem.PrivateIpAddress -eq $privateIP }

    # If assigned print it, Else wait a random time between 1-30 seconds and try associating...
    if ($assignedEIP) {
        Write-Host "Elastic IP already assigned:"
        $assignedEIP
    } else {
        $timer = Get-Random -Minimum 1 -Maximum 31
        Write-Host "Sleeping for $timer seconds"
        Start-Sleep -Seconds $timer
        # Get local instance ID
        $instanceID = Invoke-RestMethod http://169.254.169.254/latest/meta-data/instance-id
        $associated = $false
        $tries = 0
        do {
            # Get avaiable IPs from allowed EIPs that are not associated already
            $availableEIPs = Get-EC2Address -Region $region | ? { $PSItem.PublicIp -in $allowedEIPs -and $PSItem.PrivateIpAddress -eq $null }
            if($availableEIPs.Count -gt 0) {
                # Randomly choose one of the available EIPs for assignment
                $randomAvailableEIP = $availableEIPs[(Get-Random -Minimum 0 -Maximum $availableEIPs.Count )]
                try {
                    # Try to associate the EIP
                    Write-Host "Associating $($randomAvailableEIP.AllocationId): $($randomAvailableEIP.PublicIp)"
                    $associationID = Register-EC2Address -Region $region -AllocationId $randomAvailableEIP.AllocationId -InstanceId $instanceID
                    $associated = $true
                    Write-Host "Successfully associated the Elastic IP"
                } catch {
                    $tries++
                    Write-Host "Failed to associate Elastic IP. Try #$tries"
                }
            } else {
                throw "[ERROR] No Elastic IPs available for this region from the allowed list: $($allowedEIPs -join ',')"
            }
        } while (-not $associated -and $tries -lt 10)
        if(-not $associated) {
            throw "[ERROR] Unable to associate Elastic IP after multiple tries."
        }

        $confirmed = $false
        $tries = 0
        do {
            try {
                # Try to get the associated EIP
                $associatedEIP = Get-EC2Address -Region $region -AllocationId $randomAvailableEIP.AllocationId
            }
            catch {
                Write-Host "Error fetching associated Elastic IP."
            }
            # Confirm that it is associated with this instance
            if ($associatedEIP.InstanceId -eq $instanceID) {
                $confirmed = $true
                Write-Host "Confirmed the Elastic IP association:"
                $associatedEIP
            } else {
                $tries++
                Write-Host "Failed to confirm associated Elastic IP. Try#$tries"
                Start-Sleep -Seconds 3
            }
        } while (-not $confirmed -and $tries -lt 40)
        if(-not $confirmed) {
            throw "[ERROR] Unable to confirm Elastic IP after multiple tries."
        }
    }
}
catch {
    Write-Verbose "$($_.exception.message)@ $(Get-Date)"
    $_ | Write-AWSQuickStartException
}
