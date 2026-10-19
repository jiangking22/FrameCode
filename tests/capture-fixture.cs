using System;
using System.Drawing;
using System.Windows.Forms;

static class CaptureFixture
{
    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (var form = new Form())
        {
            form.Text = "Room Code Capture Test";
            form.ClientSize = new Size(680, 430);
            form.StartPosition = FormStartPosition.CenterScreen;
            form.TopMost = true;
            form.BackColor = Color.White;
            var label = new Label
            {
                Text = "ABC123",
                Font = new Font("Consolas", 64, FontStyle.Bold),
                Location = new Point(32, 60),
                AutoSize = true
            };
            form.Controls.Add(label);
            Application.Run(form);
        }
    }
}
