import "./globals.css";

export const metadata = {
  title: "Zaviri Outreach",
  description: "Agency outreach tracker for Zaviri",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
