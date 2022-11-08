# -*-mode:powershell-*- vim:ft=powershell

# ~/.config/powershell/profile.ps1
# =============================================================================
# PowerShell functions sourced by `./profile.ps1`.
#
# On Windows, this file will be copied over to these locations after
# running `chezmoi apply` by the script `.chezmoiscripts/run_powershell.bat.tmpl`:
#     - %USERPROFILE%\Documents\PowerShell
#     - %USERPROFILE%\Documents\WindowsPowerShell
#
# credit: https://github.com/renemarc/dotfiles/blob/7bbbfdc2ed95732b01a4078c93deeaf016a3e12e/dot_config/powershell/functions.ps1#L1725


# Function to relaunch as Admin
function Relaunch-Admin { Start-Process -Verb RunAs (Get-Process -Id $PID).Path }


# Create missing $IsWindows if running Powershell 5 or below.
if (!(Test-Path variable:global:IsWindows)) {
    Set-Variable "IsWindows" -Scope "Global" -Value ([System.Environment]::OSVersion.Platform -eq "Win32NT")
}

if ($null -eq (Get-Variable "ColorInfo" -ErrorAction "Ignore")) {
    Set-Variable -Name "ColorInfo" -Value "DarkYellow"
}


# Easier navigation
# -----------------------------------------------------------------------------

function Set-LocationHome {
    <#
    .SYNOPSIS
        Goes to user home directory.
    .INPUTS
        System.String
    .OUTPUTS
        None
    .LINK
        Set-Location
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Low'
    )]
    param()

    begin {
        $path = $HOME
        Write-Verbose "Destination set to $path"
    }

    process {
        if ($PSCmdlet.ShouldProcess($path, 'Go to directory')) {
            Write-Verbose "Navigating to $path"
            Set-Location $path
        }
    }
}

function Set-LocationLast {
    <#
    .SYNOPSIS
        Goes to last used directory.
    .INPUTS
        System.String
    .OUTPUTS
        None
    .LINK
        Set-Location
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Low'
    )]
    param()

    begin {
        if (!(Test-Path variable:global:LocationHistoryForward)) {
            Set-Variable "LocationHistoryForward" -Scope "Global" -Value $false
        }
        if (!$LocationHistoryForward) {
            $path = "-"
        }
        else {
            $path = "+"
        }
        Write-Verbose "Destination set to $path"
    }

    process {
        if ($PSCmdlet.ShouldProcess($path, 'Go to directory')) {
            if (!$LocationHistoryForward) {
                Set-Variable "LocationHistoryForward" -Scope "Global" -Value $true
            }
            else {
                Set-Variable "LocationHistoryForward" -Scope "Global" -Value $false
            }
            Write-Verbose "Navigating to $path"
            Set-Location $path
        }
    }
}

function Set-LocationUp {
    <#
    .SYNOPSIS
        Goes up a directory.
    .INPUTS
        System.String
    .OUTPUTS
        None
    .LINK
        Set-Location
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Low'
    )]
    param()

    begin {
        $path = Convert-Path -Path ".."
        Write-Verbose "Destination set to $path"
    }

    process {
        if ($PSCmdlet.ShouldProcess($path, 'Go to directory')) {
            Write-Verbose "Navigating to $path"
            Set-Location $path
        }
    }
}

function Set-LocationUp2 {
    <#
    .SYNOPSIS
        Goes up two directories.
    .INPUTS
        System.String
    .OUTPUTS
        None
    .LINK
        Set-Location
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Low'
    )]
    param()

    begin {
        $path = Convert-Path -Path "../.."
        Write-Verbose "Destination set to $path"
    }

    process {
        if ($PSCmdlet.ShouldProcess($path, 'Go to directory')) {
            Write-Verbose "Navigating to $path"
            Set-Location $path
        }
    }
}

function Set-LocationUp3 {
    <#
    .SYNOPSIS
        Goes up three directories.
    .INPUTS
        System.String
    .OUTPUTS
        None
    .LINK
        Set-Location
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Low'
    )]
    param()

    begin {
        $path = Convert-Path -Path "../../.."
        Write-Verbose "Destination set to $path"
    }

    process {
        if ($PSCmdlet.ShouldProcess($path, 'Go to directory')) {
            Write-Verbose "Navigating to $path"
            Set-Location $path
        }
    }
}

function Set-LocationUp4 {
    <#
    .SYNOPSIS
        Goes up four directories.
    .INPUTS
        System.String
    .OUTPUTS
        None
    .LINK
        Set-Location
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Low'
    )]
    param()

    begin {
        $path = Convert-Path -Path "../../../.."
        Write-Verbose "Destination set to $path"
    }

    process {
        if ($PSCmdlet.ShouldProcess($path, 'Go to directory')) {
            Write-Verbose "Navigating to $path"
            Set-Location $path
        }
    }
}

function Set-LocationUp5 {
    <#
    .SYNOPSIS
        Goes up five directories.
    .INPUTS
        System.String
    .OUTPUTS
        None
    .LINK
        Set-Location
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Low'
    )]
    param()

    begin {
        $path = Convert-Path -Path "../../../../.."
        Write-Verbose "Destination set to $path"
    }

    process {
        if ($PSCmdlet.ShouldProcess($path, 'Go to directory')) {
            Write-Verbose "Navigating to $path"
            Set-Location $path
        }
    }
}


# Directory browsing
# -----------------------------------------------------------------------------

function Get-ChildItemSimple {
    <#
    .SYNOPSIS
        Lists visible files in wide format.
    .PARAMETER Path
        The directory to list from.
    .INPUTS
        System.String[]
    .OUTPUTS
        System.IO.FileInfo
        System.IO.DirectoryInfo
    .LINK
        Get-ChildItem
    #>
    [CmdletBinding()]
    param(
        [Parameter(
            Mandatory=$false,
            ValueFromPipeline=$true
        )]
        [string[]]$Path = ".",

        [Parameter(ValueFromRemainingArguments=$true)]
        $Params
    )

    begin {
        # https://stackoverflow.com/a/33302472
        $hashtable = @{}
        if ($Params) {
            $Params | ForEach-Object {
                if ($_ -match "^-") {
                    $hashtable.$($_ -replace "^-") = $null
                }
                else {
                    $hashtable.$(([string[]]$hashtable.Keys)[-1]) = $_
                }
            }
        }
    }

    process {
        Get-ChildItem -Path @Path @hashtable | Format-Wide
    }
}

function Get-ChildItemVisible {
    <#
    .SYNOPSIS
        Lists visible files in long format.
    .PARAMETER Path
        The directory to list from.
    .INPUTS
        System.String[]
    .OUTPUTS
        System.IO.FileInfo
        System.IO.DirectoryInfo
    .LINK
        Get-ChildItem
    #>
    [CmdletBinding()]
    param(
        [Parameter(
            Mandatory=$false,
            ValueFromPipeline=$true
        )]
        [string[]]$Path = ".",

        [Parameter(ValueFromRemainingArguments=$true)]
        $Params
    )

    begin {
        # https://stackoverflow.com/a/33302472
        $hashtable = @{}
        if ($Params) {
            $Params | ForEach-Object {
                if ($_ -match "^-") {
                    $hashtable.$($_ -replace "^-") = $null
                }
                else {
                    $hashtable.$(([string[]]$hashtable.Keys)[-1]) = $_
                }
            }
        }
    }

    process {
        Get-ChildItem -Path @Path @hashtable
    }
}

function Get-ChildItemAll {
    <#
    .SYNOPSIS
        Lists all files in long format, excluding `.` and `..`.
    .PARAMETER Path
        The directory to list from.
    .INPUTS
        System.String[]
    .OUTPUTS
        System.IO.FileInfo
        System.IO.DirectoryInfo
    .LINK
        Get-ChildItem
    #>
    [CmdletBinding()]
    param(
        [Parameter(
            Mandatory=$false,
            ValueFromPipeline=$true
        )]
        [string[]]$Path = ".",

        [Parameter(ValueFromRemainingArguments=$true)]
        $Params
    )

    begin {
        # https://stackoverflow.com/a/33302472
        $hashtable = @{}
        if ($Params) {
            $Params | ForEach-Object {
                if ($_ -match "^-") {
                    $hashtable.$($_ -replace "^-") = $null
                }
                else {
                    $hashtable.$(([string[]]$hashtable.Keys)[-1]) = $_
                }
            }
        }
    }

    process {
        Get-ChildItem -Path @Path -Force @hashtable
    }
}

function Get-ChildItemDirectory {
    <#
    .SYNOPSIS
        Lists only directories in long format.
    .PARAMETER Path
        The directory to list from.
    .INPUTS
        System.String[]
    .OUTPUTS
        System.IO.FileInfo
        System.IO.DirectoryInfo
    .LINK
        Get-ChildItem
    #>
    [CmdletBinding()]
    param(
        [Parameter(
            Mandatory=$false,
            ValueFromPipeline=$true
        )]
        [string[]]$Path = ".",

        [Parameter(ValueFromRemainingArguments=$true)]
        $Params
    )

    begin {
        # https://stackoverflow.com/a/33302472
        $hashtable = @{}
        if ($Params) {
            $Params | ForEach-Object {
                if ($_ -match "^-") {
                    $hashtable.$($_ -replace "^-") = $null
                }
                else {
                    $hashtable.$(([string[]]$hashtable.Keys)[-1]) = $_
                }
            }
        }
    }

    process {
        Get-ChildItem -Path @Path -Directory @hashtable
    }
}

function Get-ChildItemHidden {
    <#
    .SYNOPSIS
        Lists only hidden files in long format.
    .PARAMETER Path
        The directory to list from.
    .INPUTS
        System.String[]
    .OUTPUTS
        System.IO.FileInfo
        System.IO.DirectoryInfo
    .LINK
        Get-ChildItem
    #>
    [CmdletBinding()]
    param(
        [Parameter(
            Mandatory=$false,
            ValueFromPipeline=$true
        )]
        [string[]]$Path = ".",

        [Parameter(ValueFromRemainingArguments=$true)]
        $Params
    )

    begin {
        # https://stackoverflow.com/a/33302472
        $hashtable = @{}
        if ($Params) {
            $Params | ForEach-Object {
                if ($_ -match "^-") {
                    $hashtable.$($_ -replace "^-") = $null
                }
                else {
                    $hashtable.$(([string[]]$hashtable.Keys)[-1]) = $_
                }
            }
        }
    }

    process {
        Get-ChildItem -Path @Path -Hidden @hashtable
    }
}


# File management
# -----------------------------------------------------------------------------

function Copy-ItemSecure {
    <#
    .SYNOPSIS
        Makes an exact copy of files.
    .DESCRIPTION
        Creates a copy of source files onto a local or network destination.
    .PARAMETER Source
        The source directory. This can be an absolute or relative path.
    .PARAMETER Destination
        The destination directory. It will be created if needed. This can be an
        absolute or relative path.
    .PARAMETER Flags
        Extra ROBOCOPY parameters.
    .EXAMPLE
        Copy-Item-Secure file.txt .\Destination\
    .EXAMPLE
        Copy-Item-Secure .\Source\*.zip .\Destination\
    .EXAMPLE
        Copy-Item-Secure file.txt .\Destination\ /TIMFIX
    .INPUTS
        System.Object
    .OUTPUTS
        None
    #>
    [CmdletBinding()]
    param(
        [Parameter(
            Mandatory=$true,
            ValueFromPipeline=$true
        )]
        [string]$Source,

        [Parameter(Mandatory=$true)]
        [string]$Destination
    )

    $SourcePath = Split-Path -Path $Source
    if (!$SourcePath) {
        $SourcePath = '.'
    }
    $File = Split-Path -Path $Source -Leaf

    robocopy /COPY:DAT /DCOPY:DAT /LEV:0 /R:1000000 /W:30 $SourcePath $Destination $File
}

function Find-Directory {
    <#
    .SYNOPSIS
        Finds directories.
    .INPUTS
        System.Object
    .OUTPUTS
        System.String
    .LINK
        Get-ChildItem
    #>
    Get-ChildItem -Path . -Directory -Name -Recurse -ErrorAction SilentlyContinue -Include @args
}

function Find-File {
    <#
    .SYNOPSIS
        Finds files.
    .INPUTS
        System.Object
    .OUTPUTS
        System.String
    .LINK
        Get-ChildItem
    #>
    Get-ChildItem -Path . -File -Name -Recurse -ErrorAction SilentlyContinue -Include @args
}

# Mirror directories
function Copy-ItemMirror {
    <#
    .SYNOPSIS
        Makes an exact copy of files and folders.
    .DESCRIPTION
        Creates a mirror of a source directory onto a local or network
        destination. Files currently existing at destination but not present
        in the source will be deleted.
    .PARAMETER Source
        The source directory. This can be an absolute or relative path.
    .PARAMETER Destination
        The destination directory. It will be created if needed. This can be an
        absolute or relative path.
    .PARAMETER Files
        File(s) to copy (names/wildcards: default is "*.*").
    .PARAMETER Flags
        Extra ROBOCOPY parameters.
    .EXAMPLE
        Mirror-Path .\Source\ .\Destination\
    .EXAMPLE
        Mirror-Path .\Source\ .\Destination\ *.txt
    .EXAMPLE
        Mirror-Path .\Source\ .\Destination\ *.* /XD:ExcludedDirs
    .INPUTS
        System.Object
    .OUTPUTS
        None
    #>
    [CmdletBinding()]
    param(
        [Parameter(
            Mandatory=$true,
            ValueFromPipeline=$true
        )]
        [string]$Source,

        [Parameter(Mandatory=$true)]
        [string]$Destination,

        [Parameter()]
        [string]$Files = "*.*",

        [Parameter()]
        [string]$Flags
    )

    robocopy /MIR /COPY:DAT /DCOPY:DAT /R:1000000 /W:30 $Source $Destination $Files $Flags
}

function New-ItemEmpty {
    <#
    .SYNOPSIS
        Creates an empty file or updates its timestamp.
    .Description
        Host-level *nix equivalent to `touch`.
    .INPUTS
        System.Object
    .OUTPUTS
        None
    .LINK
        New-Item
    #>
    [CmdletBinding()]
    param(
        [Parameter(
            Mandatory=$true,
            ValueFromPipeline=$true
        )]
        [string]$File
    )

    if (Test-Path $File) {
        (Get-ChildItem $File).LastWriteTime = Get-Date
    }
    else {
        New-Item -ItemType File $File
    }
}


# General
# -----------------------------------------------------------------------------

function Get-Aliases {
    <#
    .SYNOPSIS
        Lists aliases.
    .INPUTS
        None
    .OUTPUTS
        Microsoft.PowerShell.Commands.Internal.Format
    .LINK
        Get-Alias
    #>
    Get-Alias | Format-Table Name,ResolvedCommandName,Description,HelpUri
}

function Search-History {
    <#
    .SYNOPSIS
        Displays/Searches global history.
    .INPUTS
        System.Object
    .OUTPUTS
        System.String
    .LINK
        Get-Content
    #>
    $pattern = '*' + $args + '*'
    Get-Content (Get-PSReadlineOption).HistorySavePath | ? {$_ -Like $pattern} | Get-Unique
}

function Search-HistorySession {
    <#
    .SYNOPSIS
        Displays/Searches session history.
    .INPUTS
        System.Object
    .OUTPUTS
        System.String
        System.Object
    .LINK
        Get-History
    #>
    $pattern = '*' + $args + '*'
    Get-History | Where-Object {$_.CommandLine -like $pattern}
}

function New-ItemSetLocation {
    <#
    .SYNOPSIS
        Makes a directory and changes to it.
    .DESCRIPTION
        Creates a directory (if it doesn't already exist) and navigates to it.
    .PARAMETER Path
        The directory to switch to.
    .EXAMPLE
        New-Item-Set-Location .\New-Folder\
    .EXAMPLE
        New-Item-Set-Location .\Existing-Folder\
    .INPUTS
        System.Object
    .OUTPUTS
        None
    .LINK
        New-Item
    .LINK
        Get-Location
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Low'
    )]
    param(
        [Parameter(
            Mandatory=$true,
            ValueFromPipeline=$true
        )]
        [string]$Path
    )

    if (!(Test-Path -path $Path)) {
        if ($PSCmdlet.ShouldProcess($Path, 'Create directory')) {
            New-Item -ItemType Directory -Path $Path
            Write-Verbose "Path $Path created."
        }
    }

    if ($PSCmdlet.ShouldProcess($Path, 'Go to directory')) {
        Write-Verbose "Navigating to $Path"
        Set-Location -Path $Path -PassThru
    }
}

function Invoke-RepeatCommand {
    <#
    .SYNOPSIS
        Repeats a command `x` times.
    .DESCRIPTION
        Allows issuing a command multiple times in a row.
    .PARAMETER Count
        The max number of times to repeat a command.
    .PARAMETER Command
        The command to run. Can include spaces and arguments.
    .EXAMPLE
        Repeat-Command 5 echo hello world
    .INPUTS
        System.String
    .OUTPUTS
        None
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [int]$Count,

        [Parameter(Mandatory=$true)]
        $Command,

        [Parameter(ValueFromRemainingArguments=$true)]
        $Params
    )

    begin {
        $Params = $Params -join ' '
    }

    process {
        for ($i=1; $i -le $Count; $i++) {
            if ($Params) {
                &$Command $Params
            }
            else {
                &$Command
            }
        }
    }
}

# Power management
# -----------------------------------------------------------------------------

function Invoke-Lock {
    <#
    .SYNOPSIS
        Locks the session.
    .PARAMETER Force
        Do not prompt for confirmation.
    .INPUTS
        None
    .OUTPUTS
        None
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Medium'
    )]
    param(
        [switch]$Force
    )

    if ($Force -or $PSCmdlet.ShouldContinue("Are you sure you want to do this?", "Lock the session.")) {

        if ($IsWindows) {
            Invoke-Command {rundll32.exe user32.dll,LockWorkStation}
        }
        elseif ($IsMacOS) {
            pmset displaysleepnow
        }
        elseif (Get-Command "vlock" -ErrorAction "Ignore") {
            vlock --all
        }
        elseif (Get-Command "gnome-screensaver-command" -ErrorAction "Ignore") {
            gnome-screensaver-command --lock
        }
    }
}

function Invoke-Hibernate {
    <#
    .SYNOPSIS
        Goes to sleep.
    .PARAMETER Force
        Do not prompt for confirmation.
    .INPUTS
        None
    .OUTPUTS
        None
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Medium'
    )]
    param(
        [switch]$Force
    )

    if ($Force -or $PSCmdlet.ShouldContinue("Are you sure you want to do this?", "Send the system to sleep.")) {
        if ($IsLinux) {
            systemctl suspend
        }
        elseif ($IsMacOS) {
            pmset sleep now
        }
        else {
            shutdown.exe /h
        }
    }
}

function Invoke-Restart {
    <#
    .SYNOPSIS
        Restarts the system.
    .PARAMETER Force
        Do not prompt for confirmation.
    .INPUTS
        None
    .OUTPUTS
        None
    .LINK
        Restart-Computer
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Medium'
    )]
    param(
        [switch]$Force
    )

    if ($Force -or $PSCmdlet.ShouldContinue("Are you sure you want to do this?", "Restart the system.")) {
        if ($IsLinux) {
            sudo /sbin/reboot
        }
        elseif ($IsMacOS) {
            osascript -e 'tell application "System Events" to restart'
        }
        else {
            Restart-Computer
        }
    }
}

function Invoke-PowerOff {
    <#
    .SYNOPSIS
        Shuts down the system.
    .PARAMETER Force
        Do not prompt for confirmation.
    .INPUTS
        None
    .OUTPUTS
        None
    .LINK
        Stop-Computer
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Medium'
    )]
    param(
        [switch]$Force
    )

    if ($Force -or $PSCmdlet.ShouldContinue("Are you sure you want to do this?", "Shut down the system.")) {
        if ($IsLinux) {
            sudo /sbin/poweroff
        }
        elseif ($IsMacOS) {
            osascript -e 'tell application "System Events" to shut down'
        }
        else {
            Stop-Computer
        }
    }
}


# Sysadmin
# -----------------------------------------------------------------------------

function Add-EnvPath {
    <#
    .SYNOPSIS
        Adds a path to the global path list.
    .DESCRIPTION
        Allows adding a new path to the beginning of end of the path list,
        whether it be for the session (default), the user or the machine.
    .PARAMETER Path
        The path to add.
    .PARAMETER Container
        The persistence of the path's inclusion: "Session", "User", or "Machine".
    .PARAMETER Position
        "Append" (default) or "Prepend" the new path.
    .EXAMPLE
        Add-EnvPath -Path /usr/local/bin -Container User -Position Prepend
    .INPUTS
        System.String
    .OUTPUTS
        None
    .LINK
        https://gist.github.com/mkropat/c1226e0cc2ca941b23a9
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,

        [ValidateSet('Machine', 'User', 'Session')]
        [string]$Container = 'Session',

        [ValidateSet('Append', 'Prepend')]
        [string]$Position = 'Append'
    )

    begin {
        $separator = ';'
        if (!$IsWindows) {
            $separator = ':'
        }
    }

    process {
        if ($Container -ne 'Session') {
            $containerMapping = @{
                Machine = [EnvironmentVariableTarget]::Machine
                User = [EnvironmentVariableTarget]::User
            }
            $containerType = $containerMapping[$Container]

            $persistedPaths = [Environment]::GetEnvironmentVariable('Path', $containerType) -Split $separator
            if ($persistedPaths -NotContains $Path) {
                if ($Position -eq 'Append') {
                    $persistedPaths = $persistedPaths + $Path | Where { $_ }
                }
                else {
                    $persistedPaths = @($Path | Where { $_ }) + $persistedPaths
                }
                [Environment]::SetEnvironmentVariable('Path', $persistedPaths -Join ';', $containerType)
            }
        }

        $envPaths = $env:PATH -Split $separator
        if ($envPaths -NotContains $Path) {
            if ($Position -eq 'Append') {
                $envPaths = $envPaths + $Path | Where { $_ }
            }
            else {
                $envPaths = @($Path | Where { $_ }) + $envPaths
            }
            $env:PATH = $envPaths -Join $separator
        }
    }
}

function Get-Mounts {
    <#
    .SYNOPSIS
        Lists drive mounts.
    .INPUTS
        None
    .OUTPUTS
        Microsoft.PowerShell.Commands.Internal.Format
        System.String
    .LINK
        http://lifeofageekadmin.com/display-mount-points-drives-using-powershell/
    #>
    [CmdletBinding()]
    param()

    if ($IsLinux) {
        mount | awk -F" " "{ printf \"%s\t%s\n\",\$1,\$3; }" | column -t | egrep ^/dev/ | sort
    }
    elseif ($IsMacOS) {
        mount | grep -E ^/dev | column -t
    }
    else {
        $Capacity = @{Name="Capacity(GB)";Expression={[math]::round(($_.Capacity/ 1073741824))}}
        $FreeSpace = @{Name="FreeSpace(GB)";Expression={[math]::round(($_.FreeSpace / 1073741824),1)}}
        $Usage = @{Name="Usage";Expression={-join([math]::round(100-((($_.FreeSpace / 1073741824)/($_.Capacity / 1073741824)) * 100),0),'%')};Alignment="Right"}

        if ($IsCoreCLR) {
            $volumes = Get-CimInstance -ClassName Win32_Volume
        }
        else {
            $volumes = Get-WmiObject Win32_Volume
        }
        $volumes | Where name -notlike \\?\Volume* | Format-Table DriveLetter, Label, FileSystem, $Capacity, $FreeSpace, $Usage, PageFilePresent, IndexingEnabled, Compressed
    }
}

function Get-Path {
    <#
    .SYNOPSIS
        Prints each PATH entry on a separate lines.
    .INPUTS
        None
    .OUTPUTS
        System.String[]
    #>
    begin {
        $separator = ';'
        if (!$IsWindows) {
            $separator = ':'
        }
    }

    process {
        ${Env:PATH}.split($separator)
    }
}

function Get-TopProcess {
    <#
    .SYNOPSIS
        Monitors processes and system resource..
    .INPUTS
        None
    .OUTPUTS
        System.Object
    #>
    while ($true) {
        Clear-Host
        # Sort by Working Set size.
        Get-Process | Sort-Object -Descending "WS" | Select-Object -First 30 | Format-Table -Autosize
        Start-Sleep -Seconds 2
    }
}

function Update-Packages {
    <#
    .SYNOPSIS
        Keeps all apps and packages up to date.
    .DESCRIPTION
        Looks for updates for system modules and help, then proceeds to
        updating any packages by these optional managers: Chocolatey, Choco,
        npm, RubyGems.
    .INPUTS
        None
    .OUTPUTS
        None
    .LINK
        Update-Module
    .LINK
        Update-Help
    .LINK
        https://chocolatey.org/
    .LINK
        https://scoop.sh/
    .LINK
        https://www.npmjs.com/
    .LINK
        https://rubygems.org/
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='High'
    )]
    param()

    Write-Host "Looks for updates for system modules and help, then proceeds to updating any packages by these optional managers: Chocolatey, Choco, npm, RubyGems."

    if ($PSCmdlet.ShouldProcess("System modules", "Update")) {
        Write-Host "Updating system modules..." -ForegroundColor $ColorInfo
        Update-Module
    }

    if ($PSCmdlet.ShouldProcess("Help files", "Update")) {
        Write-Host "Updating help files..." -ForegroundColor $ColorInfo
        Update-Help -Force
    }

    if (Get-Command 'choco' -ErrorAction "Ignore") {
        if ($PSCmdlet.ShouldProcess("Chocolatey packages", "Update")) {
            Write-Host "Updating packages with Chocolatey..." -ForegroundColor $ColorInfo
            choco upgrade all
        }
    }

    if (Get-Command 'scoop' -ErrorAction "Ignore") {
        if ($PSCmdlet.ShouldProcess("Scoop packages", "Update")) {
            Write-Host "Updating packages with Scoop..." -ForegroundColor $ColorInfo
            scoop update *
            scoop cleanup *
        }
    }

    if (Get-Command 'npm' -ErrorAction "Ignore") {
        if ($PSCmdlet.ShouldProcess("Node.js packages", "Update")) {
            Write-Host "Updating Node.js packages with npm..." -ForegroundColor $ColorInfo
            # npm install npm -g
            npm update -g
        }
    }

    if (Get-Command 'gem' -ErrorAction "Ignore") {
        if ($PSCmdlet.ShouldProcess("Ruby gems", "Update")) {
            Write-Host "Updating Ruby gems..." -ForegroundColor $ColorInfo
            gem update --system
            gem update
            gem cleanup
        }
    }

    Write-Host "Done!"
}

function Search-Command {
    <#
    .SYNOPSIS
        Locates a command.
    .Description
        Host-level *nix equivalent to `which`.
    .INPUTS
        System.String
    .OUTPUTS
        System.Management.Automation.CommandInfo
        System.Management.Automation.AliasInfo
        System.Management.Automation.ApplicationInfo
        System.Management.Automation.FunctionInfo
        System.Management.Automation.CmdletInfo
    #>
    [CmdletBinding()]
    param(
        [Parameter(
            Mandatory=$true,
            ValueFromPipeline=$true
        )]
        [string]$Command
    )

    Get-Command $Command -ErrorAction SilentlyContinue
}


# Applications
# -----------------------------------------------------------------------------

function Start-Browser {
    <#
    .SYNOPSIS
        Opens file/URL in default browsers.
    .INPUTS
        System.String
    .OUTPUTS
        None
    .LINK
        https://docs.microsoft.com/en-us/windows-server/administration/windows-commands/start
    .LINK
        https://scriptingosx.com/2017/02/the-macos-open-command/
    #>
    if ($IsWindows) {
        start $args
    }
    else {
        open $args
    }
}

function Start-Chrome {
    <#
    .SYNOPSIS
        Opens in Google Chrome.
    .INPUTS
        System.String
    .OUTPUTS
        None
    .LINK
        https://www.google.com/chrome/
    #>
    $process = "chrome"
    if ($IsMacOS) {
        $process = "/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome"
    }
    Start-Process $process $args
}

# Development
# -----------------------------------------------------------------------------

function Invoke-Git {
    <#
    .SYNOPSIS
        Passthrough to the `git` command.
    .DESCRIPTION
        Calls the `git` command and passes it any supplied arguments.
    .INPUTS
        None
    .OUTPUTS
        None
    .LINK
        https://git-scm.com/
    #>
    $process = "git"
    &$process $args
}

# Windows
# -----------------------------------------------------------------------------

if ($IsWindows) {
    function Hide-HiddenFiles {
        <#
        .SYNOPSIS
            Hides hidden files in Explorer.
        .INPUTS
            None
        .OUTPUTS
            None
        .LINK
            https://ss64.com/nt/syntax-reghacks.html
        #>
        [CmdletBinding(
            SupportsShouldProcess=$true,
            ConfirmImpact='Low'
        )]
        param()

        if ($PSCmdlet.ShouldProcess("Hidden files", "Are you sure that you want to hide these files from Explorer?")) {
            Set-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" -Name "Hidden" -Value 2
            Write-Verbose "Hidden files are now hidden in Explorer"
        }
    }

    function Show-HiddenFiles {
        <#
        .SYNOPSIS
            Shows hidden files in Explorer.
        .INPUTS
            None
        .OUTPUTS
            None
        .LINK
            https://ss64.com/nt/syntax-reghacks.html
        #>
        [CmdletBinding(
            SupportsShouldProcess=$true,
            ConfirmImpact='Low'
        )]
        param()

        if ($PSCmdlet.ShouldProcess("Hidden files", "Are you sure that you want to display these files from Explorer?")) {
            Set-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" -Name "Hidden" -Value 1
            Write-Verbose "Hidden files are now visible in Explorer"
        }
    }
}


# Common paths
# -----------------------------------------------------------------------------

function Set-LocationDownloads {
    <#
    .SYNOPSIS
        Navigates to Downloads directory.
    .INPUTS
        None
    .OUTPUTS
        None
    .LINK
        Set-Location
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Low'
    )]
    param()

    begin {
        $path = Convert-Path -Path "${HOME}\Downloads"
        Write-Verbose "Destination set to $path"
    }

    process {
        if ($PSCmdlet.ShouldProcess($path, 'Go to directory')) {
            Write-Verbose "Navigating to $path"
            Set-Location $path
        }
    }
}

function Set-LocationDocuments {
    <#
    .SYNOPSIS
        Navigates to Documents directory.
    .INPUTS
        None
    .OUTPUTS
        None
    .LINK
        Set-Location
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Low'
    )]
    param()

    begin {
        $path = Convert-Path -Path "${HOME}\Documents"
        Write-Verbose "Destination set to $path"
    }

    process {
        if ($PSCmdlet.ShouldProcess($path, 'Go to directory')) {
            Write-Verbose "Navigating to $path"
            Set-Location $path
        }
    }
}

function Set-LocationDesktop {
    <#
    .SYNOPSIS
        Navigates to Desktop directory.
    .INPUTS
        None
    .OUTPUTS
        None
    .LINK
        Set-Location
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Low'
    )]
    param()

    begin {
        $path = Convert-Path -Path "${HOME}\Desktop"
        Write-Verbose "Destination set to $path"
    }

    process {
        if ($PSCmdlet.ShouldProcess($path, 'Go to directory')) {
            Write-Verbose "Navigating to $path"
            Set-Location $path
        }
    }
}


# Configuration paths
# -----------------------------------------------------------------------------

function Set-LocationChezmoiConf {
    <#
    .SYNOPSIS
        Navigates to Chezmoi's local repo.
    .INPUTS
        None
    .OUTPUTS
        None
    .LINK
        https://www.chezmoi.io/docs/quick-start/
    .LINK
        Set-Location
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Low'
    )]
    param()

    begin {
        if (Get-Command chezmoi -ErrorAction SilentlyContinue) {
            $path = "$(chezmoi source-path)"
        }
        else {
            $path = "${HOME}\.local\share\chezmoi"
        }
        Write-Verbose "Destination set to $path"
    }

    process {
        if ($PSCmdlet.ShouldProcess($path, 'Go to directory')) {
            Write-Verbose "Navigating to $path"
            Set-Location $path
        }
    }
}

function Set-LocationPowershellConf {
    <#
    .SYNOPSIS
        Navigates to Powershell's profile location.
    .INPUTS
        None
    .OUTPUTS
        None
    .LINK
        https://devblogs.microsoft.com/scripting/understanding-the-six-powershell-profiles/
    .LINK
        Set-Location
    #>
    [CmdletBinding(
        SupportsShouldProcess=$true,
        ConfirmImpact='Low'
    )]
    param()

    begin {
        $path = Split-Path -Path $Profile
        Write-Verbose "Destination set to $path"
    }

    process {
        if ($PSCmdlet.ShouldProcess($path, 'Go to directory')) {
            Write-Verbose "Navigating to $path"
            Set-Location $path
        }
    }
}
