# 递归删除与移动

递归删除或移动前，必须证明每个源和目标都是用户指定根目录的严格子路径。严格子路径排除根目录本身，也排除仅共享字符串前缀的兄弟目录。

## 边界函数

对已存在的路径使用 `-RequireExisting`；对尚不存在的移动目标，先解析其已存在父目录，再构造绝对目标路径。

```powershell
function Assert-PathWithinRoot {
    param(
        [Parameter(Mandatory)] [string] $RootPath,
        [Parameter(Mandatory)] [string] $TargetPath,
        [switch] $RequireExisting
    )

    $separators = [char[]] @(
        [System.IO.Path]::DirectorySeparatorChar,
        [System.IO.Path]::AltDirectorySeparatorChar
    )
    $root = [System.IO.Path]::GetFullPath(
        (Resolve-Path -LiteralPath $RootPath -ErrorAction Stop).Path
    ).TrimEnd($separators)
    $candidate = if ($RequireExisting) {
        (Resolve-Path -LiteralPath $TargetPath -ErrorAction Stop).Path
    } else {
        $TargetPath
    }
    $target = [System.IO.Path]::GetFullPath($candidate).TrimEnd($separators)
    $comparison = [System.StringComparison]::OrdinalIgnoreCase
    $prefix = $root + [System.IO.Path]::DirectorySeparatorChar

    if ($target.Equals($root, $comparison) -or -not $target.StartsWith($prefix, $comparison)) {
        throw "Target is not a strict descendant of the intended root: $target"
    }

    $target
}
```

删除已存在目标：

```powershell
$target = Assert-PathWithinRoot -RootPath $intendedRootPath -TargetPath $targetPath -RequireExisting
Remove-Item -LiteralPath $target -Recurse -Force
```

移动时分别验证源和目标。目标不存在时，解析其已存在父目录，再组合并验证完整目标：

```powershell
$source = Assert-PathWithinRoot -RootPath $intendedRootPath -TargetPath $sourcePath -RequireExisting
$destinationParent = (Resolve-Path -LiteralPath (Split-Path -Parent $destinationPath) -ErrorAction Stop).Path
$destinationCandidate = Join-Path $destinationParent (Split-Path -Leaf $destinationPath)
$destination = Assert-PathWithinRoot -RootPath $intendedRootPath -TargetPath $destinationCandidate
Move-Item -LiteralPath $source -Destination $destination
```

完成时，根目录本身、同前缀兄弟目录和根目录之外的路径都会被拒绝；操作后只核对用户指定的源与目标状态。
