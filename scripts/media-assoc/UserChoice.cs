using System;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;

namespace MpvAssoc
{
    public static class UserChoice
    {
        [StructLayout(LayoutKind.Sequential)]
        public struct SYSTEMTIME
        {
            public ushort Year, Month, DayOfWeek, Day, Hour, Minute, Second, Milliseconds;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct FILETIME
        {
            public uint dwLowDateTime;
            public uint dwHighDateTime;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SystemTimeToFileTime(ref SYSTEMTIME lpSystemTime, out FILETIME lpFileTime);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool FileTimeToSystemTime(ref FILETIME lpFileTime, out SYSTEMTIME lpSystemTime);

        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern int RegQueryInfoKey(IntPtr hKey, IntPtr lpClass, IntPtr lpcchClass,
            IntPtr lpReserved, out uint lpcSubKeys, out uint lpcbMaxSubKeyLen, out uint lpcbMaxClassLen,
            out uint lpcValues, out uint lpcbMaxValueNameLen, out uint lpcbMaxValueLen,
            out uint lpcbSecurityDescriptor, out FILETIME lpftLastWriteTime);

        private const string UserExperience =
            "User Choice set via Windows User Experience {D18B6DD5-6124-4341-9318-804003BAFA0B}";

        public const string FileExtsRoot =
            @"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\";

        /// <summary>Canonical input string for the UserChoice hash (already lowercased).</summary>
        public static string BuildInput(string ext, string sid, string progId, uint ftHigh, uint ftLow)
        {
            return (ext + sid + progId
                    + ftHigh.ToString("x8")
                    + ftLow.ToString("x8")
                    + UserExperience).ToLowerInvariant();
        }

        private static uint WordSwap(uint v) { return (v >> 16) | (v << 16); }

        /// <summary>8-byte raw UserChoice hash.</summary>
        public static byte[] RawHash(string input)
        {
            byte[] bytes = Encoding.Unicode.GetBytes(input + "\0");
            int blockCount = bytes.Length / 8;
            if (blockCount == 0) return null;

            byte[] md5;
            using (var m = MD5.Create()) { md5 = m.ComputeHash(bytes); }
            uint m0 = BitConverter.ToUInt32(md5, 0) | 1u;
            uint m1 = BitConverter.ToUInt32(md5, 4) | 1u;

            uint[][] C0s =
            {
                new uint[] { m0, 0xCF98B111u, 0x87085B9Fu, 0x12CEB96Du, 0x257E1D83u },
                new uint[] { m1, 0xA27416F5u, 0xD38396FFu, 0x7C932B89u, 0xBFA49F69u }
            };
            uint[][] C1s =
            {
                new uint[] { m0, 0xEF0569FBu, 0x689B6B9Fu, 0x79F8A395u, 0xC3EFEA97u },
                new uint[] { m1, 0xC31713DBu, 0xDDCD1F0Fu, 0x59C3AF2Du, 0x35BD1EC9u }
            };

            uint h0 = 0, h1 = 0, h0Acc = 0, h1Acc = 0;
            for (int i = 0; i < blockCount; i++)
            {
                for (int j = 0; j < 2; j++)
                {
                    uint[] C0 = C0s[j], C1 = C1s[j];
                    uint word = BitConverter.ToUInt32(bytes, (i * 2 + j) * 4);
                    unchecked
                    {
                        h0 += word;
                        h0 *= C0[0];
                        h0 = WordSwap(h0) * C0[1];
                        h0 = WordSwap(h0) * C0[2];
                        h0 = WordSwap(h0) * C0[3];
                        h0 = WordSwap(h0) * C0[4];
                        h0Acc += h0;

                        h1 += word;
                        h1 = WordSwap(h1) * C1[1] + h1 * C1[0];
                        h1 = (h1 >> 16) * C1[2] + h1 * C1[3];
                        h1 = WordSwap(h1) * C1[4] + h1;
                        h1Acc += h1;
                    }
                }
            }

            byte[] outp = new byte[8];
            Buffer.BlockCopy(new uint[] { h0 ^ h1, h0Acc ^ h1Acc }, 0, outp, 0, 8);
            return outp;
        }

        /// <summary>
        /// Reproduce the timestamp Windows hashes: take the key's last-write FILETIME,
        /// decompose it (UTC SYSTEMTIME), zero seconds/milliseconds, then reinterpret
        /// that SYSTEMTIME as local time (this local reinterpretation is what the
        /// Windows algorithm itself does, so we must match it).
        /// </summary>
        public static FILETIME NormalizeTimestamp(FILETIME ft)
        {
            SYSTEMTIME st;
            if (!FileTimeToSystemTime(ref ft, out st))
                throw new InvalidOperationException("FileTimeToSystemTime failed");
            st.Second = 0;
            st.Milliseconds = 0;
            FILETIME outFt;
            if (!SystemTimeToFileTime(ref st, out outFt))
                throw new InvalidOperationException("SystemTimeToFileTime failed");
            return outFt;
        }

        /// <summary>The string stored in the registry "Hash" value.</summary>
        public static string HashFor(string ext, string sid, string progId, uint ftHigh, uint ftLow)
        {
            FILETIME ft = new FILETIME { dwHighDateTime = ftHigh, dwLowDateTime = ftLow };
            FILETIME norm = NormalizeTimestamp(ft);
            byte[] raw = RawHash(BuildInput(ext, sid, progId, norm.dwHighDateTime, norm.dwLowDateTime));
            return raw == null ? null : Convert.ToBase64String(raw);
        }

        /// <summary>FILETIME (UTC) of the UserChoice key's last write, or null if unreadable.</summary>
        public static FILETIME? GetUserChoiceLastWrite(string ext)
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(FileExtsRoot + ext + @"\UserChoice", false))
            {
                if (k == null) return null;
                uint a, b, c, d, e, f, g;
                FILETIME ft;
                int rc = RegQueryInfoKey(k.Handle.DangerousGetHandle(), IntPtr.Zero, IntPtr.Zero, IntPtr.Zero,
                    out a, out b, out c, out d, out e, out f, out g, out ft);
                if (rc != 0) return null;
                return ft;
            }
        }

        /// <summary>FILETIME for "now" truncated to the second, in UTC (what Windows stores).</summary>
        public static FILETIME NowTruncated()
        {
            DateTime now = DateTime.UtcNow;
            SYSTEMTIME st = new SYSTEMTIME
            {
                Year = (ushort)now.Year,
                Month = (ushort)now.Month,
                DayOfWeek = (ushort)now.DayOfWeek,
                Day = (ushort)now.Day,
                Hour = (ushort)now.Hour,
                Minute = (ushort)now.Minute,
                Second = 0,
                Milliseconds = 0
            };
            FILETIME ft;
            if (!SystemTimeToFileTime(ref st, out ft)) throw new InvalidOperationException("SystemTimeToFileTime failed");
            return ft;
        }
    }

    public static class Assoc
    {
        private const int ASSOCF_NONE = 0;
        private const int ASSOCSTR_EXECUTABLE = 2;
        private const int ASSOCSTR_FRIENDLYAPPNAME = 4;
        private const int S_OK = 0;
        private const int S_FALSE = 1;

        [DllImport("shlwapi.dll", CharSet = CharSet.Unicode, SetLastError = false)]
        private static extern int AssocQueryStringW(int flags, int str, string assoc, string extra,
            StringBuilder outBuf, ref uint outLen);

        public static string Query(string ext, int str)
        {
            uint len = 1024;
            var sb = new StringBuilder(1024);
            int hr = AssocQueryStringW(ASSOCF_NONE, str, ext, null, sb, ref len);
            if (hr != S_OK && hr != S_FALSE) return "0x" + hr.ToString("X8");
            return sb.ToString();
        }

        public static string Exe(string ext) { return Query(ext, ASSOCSTR_EXECUTABLE); }
        public static string AppName(string ext) { return Query(ext, ASSOCSTR_FRIENDLYAPPNAME); }
    }
}
