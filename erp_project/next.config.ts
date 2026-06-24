import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mysql2", "@react-pdf/renderer", "fontkit", "pdfkit", "nodemailer"],
};

export default nextConfig;
