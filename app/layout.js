import "./globals.css";

export const metadata = {
  title: "Zaviri Outreach",
  description: "Agency outreach tracker for Zaviri",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('zaviri-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
