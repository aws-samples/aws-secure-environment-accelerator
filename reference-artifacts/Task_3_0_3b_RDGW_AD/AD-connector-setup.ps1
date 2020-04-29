[CmdletBinding()]
param(
    [string]
    $GroupName,

    [string]
    $UserName,

    [string]
    $Password,

    [string]
    $DomainAdminUser,

    [string]
    $DomainAdminPassword,

    [string]
    $PasswordNeverExpires
)

# Turned off logging;
# Start-Transcript -Path C:\cfn\log\AD-connector-setup.txt

#This part of the code gets the domain name and splits it
$fdn=(Get-WmiObject Win32_ComputerSystem).Domain
$dom,$ext=$fdn.split('.')

$pass = ConvertTo-SecureString $Password -AsPlainText -Force
$securePassword = ConvertTo-SecureString $DomainAdminPassword -AsPlainText -Force
$credential = New-Object System.Management.Automation.PSCredential $DomainAdminUser, $securePassword

#Create Group
New-ADGroup -Name $GroupName -GroupCategory Security -GroupScope Global -Credential $credential

#Create User
New-ADUser -Name $UserName -EmailAddress "$UserName@$dom" -AccountPassword $pass -Enabled 1 -Credential $credential -SamAccountName $UserName

#Add User to Group
Add-ADGroupMember -Identity $GroupName -Members $UserName -Credential $credential

#Delegate Control
dsacls "CN=$GroupName,OU=Users,OU=$dom,DC=$dom,DC=$ext" /I:T /G "$dom\$GroupName:CCDC;computer"
dsacls "CN=$GroupName,OU=Users,OU=$dom,DC=$dom,DC=$ext" /I:T /G "$dom\$GroupName:CCDC;user"

#Set the admin & connector user's password never expires flag
If (-NOT  ($PasswordNeverExpires -eq 'No')) {
  Set-ADUser -Identity $UserName -PasswordNeverExpires $true -Credential $credential
  Set-ADUser -Identity $DomainAdminUser.split("\")[1] -PasswordNeverExpires $true -Credential $credential
}  Else {
  Set-ADUser -Identity $UserName -PasswordNeverExpires $false -Credential $credential
  Set-ADUser -Identity $DomainAdminUser.split("\")[1] -PasswordNeverExpires $false -Credential $credential
}
