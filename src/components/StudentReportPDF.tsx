import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// Register fonts if needed, but standard fonts work fine
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 40,
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'column',
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#FF9800',
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    color: '#05412B',
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#05412B',
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    backgroundColor: '#F3F4F6',
    padding: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableColHeader: {
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderLeftWidth: 0,
    borderTopWidth: 0,
    backgroundColor: '#05412B',
  },
  tableCol: {
    width: '25%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  tableCellHeader: {
    margin: 5,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  tableCell: {
    margin: 5,
    fontSize: 10,
    color: '#333333',
  },
  practiceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  practiceCategory: {
    fontSize: 12,
    color: '#333333',
  },
  practiceValue: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: 'bold',
  },
  trendItem: {
    fontSize: 12,
    color: '#333333',
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 10,
  }
});

interface RoundData {
  date: string;
  score: number;
  girPercent: number;
  putts: number;
}

interface PracticeData {
  category: string;
  minutes: number;
}

interface TrendData {
  text: string;
}

interface StudentReportPDFProps {
  studentName: string;
  rounds: RoundData[];
  practiceData: PracticeData[];
  trends: TrendData[];
}

export const StudentReportPDF: React.FC<StudentReportPDFProps> = ({ 
  studentName, 
  rounds, 
  practiceData,
  trends
}) => {
  const date = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Blake Dowd Golf Academy</Text>
          <Text style={styles.subtitle}>Student Performance Report - {studentName}</Text>
          <Text style={styles.subtitle}>Generated on: {date}</Text>
        </View>

        {/* Section 1: On-Course Stats */}
        <Text style={styles.sectionTitle}>On-Course Stats (Recent Rounds)</Text>
        <View style={styles.table}>
          <View style={styles.tableRow}>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Round Date</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Score</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>GIR %</Text></View>
            <View style={styles.tableColHeader}><Text style={styles.tableCellHeader}>Putts</Text></View>
          </View>
          {rounds.slice(0, 10).map((round, i) => (
            <View style={styles.tableRow} key={i}>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{round.date}</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{round.score}</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{round.girPercent.toFixed(1)}%</Text></View>
              <View style={styles.tableCol}><Text style={styles.tableCell}>{round.putts}</Text></View>
            </View>
          ))}
          {rounds.length === 0 && (
            <View style={styles.tableRow}>
              <View style={{ ...styles.tableCol, width: '100%' }}>
                <Text style={styles.tableCell}>No rounds recorded recently.</Text>
              </View>
            </View>
          )}
        </View>

        {/* Section 2: Practice Allocation */}
        <Text style={styles.sectionTitle}>Practice Allocation</Text>
        <View style={{ marginBottom: 10 }}>
          {practiceData.map((practice, i) => (
            <View style={styles.practiceItem} key={i}>
              <Text style={styles.practiceCategory}>{practice.category}</Text>
              <Text style={styles.practiceValue}>{practice.minutes} mins</Text>
            </View>
          ))}
        </View>

        {/* Section 3: Progress Summary */}
        <Text style={styles.sectionTitle}>Progress Summary</Text>
        <View>
          {trends.length > 0 ? trends.map((trend, i) => (
            <View style={styles.trendItem} key={i}>
              <Text>• {trend.text}</Text>
            </View>
          )) : (
            <Text style={styles.trendItem}>Not enough data to calculate trends yet.</Text>
          )}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Confidential - For Student Use Only • Blake Dowd Golf Academy
        </Text>
      </Page>
    </Document>
  );
};
