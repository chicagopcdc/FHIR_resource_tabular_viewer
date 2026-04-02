import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const PatientDemographics = ({ patientData }) => {
  if (!patientData) return null;

  const calculateAge = (birthDate) => {
    if (!birthDate) return "Unknown";
    try {
      const today = new Date();
      const birth = new Date(birthDate);
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      return age >= 0 ? `${age} years` : "Unknown";
    } catch {
      return "Unknown";
    }
  };

  const personalData = [
    { label: "Given Name", value: patientData.given_name || "Unknown" },
    { label: "Family Name", value: patientData.family_name || "Unknown" },
    { label: "Birth Date", value: patientData.birth_date || "Unknown" },
    { label: "Age", value: calculateAge(patientData.birth_date) },
    { label: "Gender", value: patientData.gender || "Unknown" },
    { label: "City", value: patientData.city || "Unknown" },
    { label: "State", value: patientData.state || "Unknown" },
    { label: "Postal Code", value: patientData.postal_code || "Unknown" },
    { label: "Multiple Birth", value: patientData.multipleBirthBoolean ? "Yes" : "No" },
    { label: "Patient ID", value: patientData.id || "Unknown" },
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          Personal Information
          <Badge variant={patientData.active ? "success" : "secondary"}>
            {patientData.active ? "Active" : "Inactive"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            {personalData.map((item, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium text-muted-foreground w-1/3">
                  {item.label}
                </TableCell>
                <TableCell>{item.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default PatientDemographics;
