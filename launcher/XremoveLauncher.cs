using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace XremoveLauncher
{
    static class Program
    {
        private const string HealthUrl = "http://127.0.0.1:8765/api/health";

        [STAThread]
        static void Main()
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            string logsDir = Path.Combine(appDir, "logs");
            string launcherLog = Path.Combine(logsDir, "launcher.log");

            try
            {
                if (!Directory.Exists(logsDir))
                {
                    Directory.CreateDirectory(logsDir);
                }
            }
            catch { }

            Action<string> log = delegate(string msg)
            {
                try
                {
                    string line = string.Format("[{0:yyyy-MM-dd HH:mm:ss.fff}] {1}\r\n", DateTime.Now, msg);
                    File.AppendAllText(launcherLog, line);
                }
                catch { }
            };

            log("==================================================");
            log("Xremove Launcher Starting");
            log("==================================================");
            log("APP_ROOT: " + appDir);

            try
            {
                string htmlFile = Path.Combine(appDir, @"Xremove.html");
                string pythonExe = Path.Combine(appDir, @"runtime\python\python.exe");
                string servicePy = Path.Combine(appDir, @"service\engine_b_service.py");
                string vendorDir = Path.Combine(appDir, @"vendor\watermarks-remover");
                string ffmpegDir = Path.Combine(appDir, @"tools\ffmpeg");

                log("HTML File: " + htmlFile);
                log("Python Path: " + pythonExe);
                log("Service Path: " + servicePy);
                log("Vendor Directory: " + vendorDir);
                log("Working Directory: " + appDir);

                // Strict validation of canonical application structure
                bool isValidAppRoot = File.Exists(htmlFile) &&
                                      File.Exists(pythonExe) &&
                                      File.Exists(servicePy) &&
                                      Directory.Exists(vendorDir);

                if (!isValidAppRoot)
                {
                    log("ERROR: Invalid APP_ROOT structure. One or more canonical components are missing.");
                    if (!File.Exists(htmlFile)) log("  MISSING: " + htmlFile);
                    if (!File.Exists(pythonExe)) log("  MISSING: " + pythonExe);
                    if (!File.Exists(servicePy)) log("  MISSING: " + servicePy);
                    if (!Directory.Exists(vendorDir)) log("  MISSING: " + vendorDir);

                    MessageBox.Show(
                        "Xremove.exe phải nằm trong thư mục ứng dụng đầy đủ.\n" +
                        "Không sao chép riêng Xremove.exe ra ngoài thư mục Xremove.\n\n" +
                        "Xremove.exe must remain inside the complete application folder.\n" +
                        "Do not copy Xremove.exe by itself.",
                        "Xremove — Lỗi cấu trúc ứng dụng",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                // Check if Engine B is already healthy
                bool isHealthy = CheckHealth();
                log("Initial Health Check: " + (isHealthy ? "XREMOVE 1.1 SERVICE RUNNING" : "OFFLINE OR OTHER SERVICE"));

                Process childProcess = null;

                if (!isHealthy)
                {
                    log("Starting bundled Python child process...");

                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = pythonExe;
                    psi.Arguments = "\"" + servicePy + "\"";
                    psi.WorkingDirectory = appDir;
                    psi.CreateNoWindow = true;
                    psi.UseShellExecute = false;
                    psi.WindowStyle = ProcessWindowStyle.Hidden;

                    string currentPath = Environment.GetEnvironmentVariable("PATH") ?? "";
                    psi.EnvironmentVariables["PATH"] = ffmpegDir + ";" + Path.Combine(appDir, @"runtime\python") + ";" + currentPath;

                    childProcess = Process.Start(psi);

                    if (childProcess != null)
                    {
                        log("Child Python PID: " + childProcess.Id);
                    }
                    else
                    {
                        log("ERROR: Process.Start returned null");
                    }

                    // Poll health endpoint up to 30 times (each with 300ms delay = 9s total)
                    for (int attempt = 1; attempt <= 30; attempt++)
                    {
                        Thread.Sleep(300);

                        if (childProcess != null && childProcess.HasExited)
                        {
                            log(string.Format("ERROR: Child process exited prematurely with exit code: {0}", childProcess.ExitCode));
                            break;
                        }

                        if (CheckHealth())
                        {
                            isHealthy = true;
                            log(string.Format("Health check succeeded on attempt {0} (200 OK)", attempt));
                            break;
                        }
                        else
                        {
                            log(string.Format("Health check attempt {0}/30: waiting...", attempt));
                        }
                    }
                }

                if (!isHealthy)
                {
                    log("FATAL: Service failed to reach healthy state.");
                    MessageBox.Show(
                        "Xremove could not start the local processing service.\n\n" +
                        "Không thể khởi động dịch vụ xử lý cục bộ Engine B.\n\n" +
                        "Log file:\n" + launcherLog,
                        "Xremove — Lỗi dịch vụ",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                log("Xremove local service verified. Opening same-origin UI.");
                Process.Start(new ProcessStartInfo("http://127.0.0.1:8765/") { UseShellExecute = true });
                log("UI launched successfully.");
            }
            catch (Exception ex)
            {
                log("FATAL EXCEPTION: " + ex.ToString());
                MessageBox.Show(
                    "Đã xảy ra lỗi khi khởi chạy Xremove:\n" + ex.Message + "\n\nLog: " + launcherLog,
                    "Xremove Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private static bool CheckHealth()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(HealthUrl);
                req.Method = "GET";
                req.Timeout = 1000;
                req.ReadWriteTimeout = 1000;

                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                {
                    if (resp.StatusCode != HttpStatusCode.OK || !resp.ContentType.StartsWith("application/json")) return false;
                    using (StreamReader reader = new StreamReader(resp.GetResponseStream()))
                    {
                        string body = reader.ReadToEnd();
                        return body.Contains(@"""service"": ""xremove-local-jobs""") &&
                               body.Contains(@"""version"": ""1.1.1""");
                    }
                }
            }
            catch
            {
                return false;
            }
        }
    }
}
