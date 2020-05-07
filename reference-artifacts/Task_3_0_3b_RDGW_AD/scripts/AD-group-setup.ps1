[CmdletBinding()]
param(
    [string]
    $GroupNames,

    [string]
    $DomainAdminUser,

    [string]
    $DomainAdminPassword
)

# Turned off logging;
# Start-Transcript -Path C:\cfn\log\AD-connector-setup.txt

#This part of the code gets the domain name and splits it
$fdn=(Get-WmiObject Win32_ComputerSystem).Domain
$dom,$ext=$fdn.split('.')

$securePassword = ConvertTo-SecureString $DomainAdminPassword -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential $DomainAdminUser, $securePassword

$groupsArray = $GroupNames -split ','

for ($i=0; $i -lt $groupsArray.Length; $i++) {
    #Create Group
    New-ADGroup -Name $groupsArray[$i] -GroupCategory Security -GroupScope Global -Credential $credential
}