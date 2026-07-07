import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["mysql2", "@react-pdf/renderer", "fontkit", "pdfkit", "nodemailer", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
};

export default nextConfig;
