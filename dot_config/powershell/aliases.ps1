# ~/.config/powershell/aliases.ps1

# =============================================================================
# PowerShell aliases sourced by `./profile.ps1`.
#
# On Windows, this file will be copied over to these locations after
# running `chezmoi apply` by the script `../../run_powershell.bat.tmpl`:
#     - %USERPROFILE%\Documents\PowerShell
#     - %USERPROFILE%\Documents\WindowsPowerShell
#
# Since PowerShell does not allow aliases to contain parameters, most of the
# logic is wrapped in `./functions.ps1`.
#
# credit: https://github.com/renemarc/dotfiles/blob/7bbbfdc2ed95732b01a4078c93deeaf016a3e12e/dot_config/powershell/aliases.ps1

# Alias to relauch powershell as admin
Set-Alias -Name "psadmin" -Value Relaunch-Admin -Description "Relaunch PowerShell as Administrator"

# Create missing $IsWindows if running Powershell 5 or below.
if (!(Test-Path variable:global:IsWindows)) {
    Set-Variable "IsWindows" -Scope "Global" -Value ([System.Environment]::OSVersion.Platform -eq "Win32NT")
}

# Easier navigation
# -----------------------------------------------------------------------------

Set-Alias -Name "~" -Value Set-LocationHome -Description "Goes to user home directory."
Set-Alias -Name "cd-" -Value Set-LocationLast -Description "Goes to last used directory."
Set-Alias -Name ".." -Value Set-LocationUp -Description "Goes up a directory."
Set-Alias -Name "..." -Value Set-LocationUp2 -Description "Goes up two directories."
Set-Alias -Name "...." -Value Set-LocationUp3 -Description "Goes up three directories."
Set-Alias -Name "....." -Value Set-LocationUp4 -Description "Goes up four directories."
Set-Alias -Name "......" -Value Set-LocationUp5 -Description "Goes up five directories."


# Directory browsing
# -----------------------------------------------------------------------------

if (!(Get-Command "ls" -ErrorAction "Ignore")) {
    Set-Alias -Name "ls" -Value Get-ChildItemSimple -Description "Lists visible files in wide format."
}

Set-Alias -Name "l" -Value Get-ChildItemVisible -Description "Lists visible files in long format."
Set-Alias -Name "ll" -Value Get-ChildItemAll -Description "Lists all files in long format."
Set-Alias -Name "lsd" -Value Get-ChildItemDirectory -Description "Lists only directories in long format."
Set-Alias -Name "lsh" -Value Get-ChildItemHidden -Description "Lists only hidden files in long format."


# File management
# -----------------------------------------------------------------------------

Set-Alias -Name "cpv" -Value Copy-ItemSecure -Description "Makes an exact copy of files."
Set-Alias -Name "fd" -Value Find-Directory -Description "Finds directories."
Set-Alias -Name "ff" -Value Find-File -Description "Finds files."
Set-Alias -Name "mirror" -Value Copy-ItemMirror -Description "Makes an exact copy of files and folders."

if (!(Get-Command "touch" -ErrorAction "Ignore")) {
    Set-Alias -Name "touch" -Value New-ItemEmpty -Description "Creates an empty file or updates its timestamp."
}


# General
# -----------------------------------------------------------------------------

if (Test-Path alias:h) {
    Remove-Item alias:h
}

Set-Alias -Name "alias" -Value Get-Aliases -Description "Lists aliases."
Set-Alias -Name "c" -Value Clear-Host -Description "Clears screen."
Set-Alias -Name "h" -Value "Search-History" -Description "Displays/Searches global history."
Set-Alias -Name "hs" -Value "Search-HistorySession" -Description "Displays/Searches session history."
Set-Alias -Name "mkcd" -Value New-ItemSetLocation -Description "Makes a directory and change to it."
Set-Alias -Name "take" -Value New-ItemSetLocation -Description "Makes a directory and change to it."
Set-Alias -Name "repeat" -Value Invoke-RepeatCommand -Description "Repeats a command x times."

# Power management
# -----------------------------------------------------------------------------

Set-Alias -Name "lock" -Value Invoke-Lock -Description "Locks the session."
Set-Alias -Name "hibernate" -Value Invoke-Hibernate -Description "Goes to sleep."
Set-Alias -Name "reboot" -Value Invoke-Restart -Description "Restarts the system."
Set-Alias -Name "poweroff" -Value Invoke-PowerOff -Description "Shuts down the system."


# Sysadmin
# -----------------------------------------------------------------------------

Set-Alias -Name "mnt" -Value Get-Mounts -Description "Lists drive mounts."
Set-Alias -Name "path" -Value Get-Path -Description "Prints each PATH entry on a separate line."

foreach ($_ in ("ntop", "atop", "htop", "top", "Get-TopProcess")) {
    if (Get-Command $_ -ErrorAction "Ignore") {
        Set-Alias -Name "top" -Value $_ -Description "Monitors processes and system resources."
        break
    }
}

foreach ($_ in ("winfetch", "neofetch", "screenfetch")) {
    if (Get-Command $_ -ErrorAction "Ignore") {
        Set-Alias -Name "sysinfo" -Value $_ -Description "Displays information about the system."
        break
    }
}

Set-Alias -Name "update" -Value Update-Packages -Description "Keeps all apps and packages up to date."

if (!(Get-Command "which" -ErrorAction "Ignore")) {
    Set-Alias -Name "which" -Value Search-Command -Description "Locates a command."
}

# Browsers
# -----------------------------------------------------------------------------

Set-Alias -Name "browse" -Value Start-Browser -Description "Opens file/URL in default browsers."
Set-Alias -Name "chrome" -Value Start-Chrome -Description "Opens in Google Chrome."

# Git
# -----------------------------------------------------------------------------

Set-Alias -Name "g" -Value Invoke-Git -Description "Passthrough to the `git` command."


# Windows
# -----------------------------------------------------------------------------

if ($IsWindows) {
    Set-Alias -Name "hidefiles" -Value Hide-HiddenFiles -Description "Hides hidden files in Explorer."

    Set-Alias -Name "showfiles" -Value Show-HiddenFiles -Description "Shows hidden files in Explorer."
}


# Common paths
# -----------------------------------------------------------------------------

Set-Alias -Name "dls" -Value Set-LocationDownloads -Description "Navigates to Downloads directory."
Set-Alias -Name "docs" -Value Set-LocationDocuments -Description "Navigates to Documents directory."
Set-Alias -Name "dt" -Value Set-LocationDesktop -Description "Navigates to Desktop directory."


# Configuration paths
# -----------------------------------------------------------------------------

Set-Alias -Name "cdot" -Value Set-LocationChezmoiConf -Description "Navigates to Chezmoi's local repo."
Set-Alias -Name "powershellconf" -Value Set-LocationPowershellConf -Description "Navigates to Powershell's profile location."


# Clipboard
# -----------------------------------------------------------------------------
foreach ($_ in ("Set-Clipboard", "Set-ClipboardText")) {
    if (Get-Command $_ -ErrorAction "Ignore") {
        Set-Alias -Name "cb" -Value $_ -Description "Copies contents to the clipboard."
        break
    }
}

foreach ($_ in ("Get-Clipboard", "Get-ClipboardText")) {
    if (Get-Command $_ -ErrorAction "Ignore") {
        Set-Alias -Name "cbpaste" -Value $_ -Description "Copies contents to the clipboard."
        break
    }
}