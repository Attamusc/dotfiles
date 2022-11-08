# Determine user profile parent directory.
$ProfilePath=Split-Path -parent $profile

# Load functions declarations from separate configuration file.
if (Test-Path $ProfilePath/functions.ps1) {
    . $ProfilePath/functions.ps1
}

# Load aliases from separate configuration file.
if (Test-Path $ProfilePath/aliases.ps1) {
    . $ProfilePath/aliases.ps1
}

Invoke-Expression (& {
    $hook = if ($PSVersionTable.PSVersion.Major -lt 6) { 'prompt' } else { 'pwd' }
    (zoxide init --hook $hook powershell) -join "`n"
})

Invoke-Expression (&starship init powershell)