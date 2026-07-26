import {
  Card,
  Grid,
  HStack,
  Skeleton,
  VStack,
} from '@astryxdesign/core'

function SkeletonTableRows({ rows = 4 }: { rows?: number }) {
  return (
    <VStack gap={2}>
      {Array.from({ length: rows }, (_, index) => (
        <HStack key={index} gap={2}>
          <Skeleton width="30%" height={14} index={index} />
          <Skeleton width="20%" height={14} index={index + 1} />
          <Skeleton width="15%" height={14} index={index + 2} />
          <Skeleton width="15%" height={14} index={index + 3} />
        </HStack>
      ))}
    </VStack>
  )
}

export function DashboardSkeleton() {
  return (
    <VStack as="main" gap={4} aria-busy="true" aria-label="Loading dashboard">
      <VStack gap={1}>
        <Skeleton width={180} height={28} index={0} />
        <Skeleton width={220} height={14} index={1} />
      </VStack>

      <Grid columns={{ minWidth: 320 }} gap={4}>
        <Card>
          <VStack gap={3}>
            <Skeleton width={140} height={14} index={2} />
            <Skeleton width={120} height={32} index={3} />
            <Skeleton width="100%" height={8} index={4} />
            <Skeleton width="70%" height={12} index={5} />
          </VStack>
        </Card>
        <Card>
          <VStack gap={3}>
            <Skeleton width={80} height={14} index={6} />
            <Skeleton width="100%" height={8} index={7} />
            <Skeleton width="100%" height={8} index={8} />
            <Skeleton width="100%" height={8} index={9} />
          </VStack>
        </Card>
      </Grid>

      <Grid columns={{ minWidth: 200, max: 3 }} gap={4}>
        <Card>
          <VStack gap={1}>
            <Skeleton width={120} height={14} index={10} />
            <Skeleton width={80} height={28} index={11} />
          </VStack>
        </Card>
        <Card>
          <VStack gap={1}>
            <Skeleton width={60} height={14} index={12} />
            <Skeleton width={100} height={28} index={13} />
          </VStack>
        </Card>
        <Card>
          <VStack gap={1}>
            <Skeleton width={120} height={14} index={14} />
            <Skeleton width={40} height={28} index={15} />
          </VStack>
        </Card>
      </Grid>

      <Card>
        <VStack gap={3}>
          <Skeleton width={120} height={14} index={16} />
          <HStack gap={2} wrap="wrap">
            <Skeleton width={100} height={36} index={17} />
            <Skeleton width={120} height={36} index={18} />
            <Skeleton width={120} height={36} index={19} />
          </HStack>
        </VStack>
      </Card>
    </VStack>
  )
}

export function NutritionSkeleton() {
  return (
    <VStack as="main" gap={4} aria-busy="true" aria-label="Loading nutrition">
      <VStack gap={2}>
        <Skeleton width={160} height={28} index={0} />
        <Skeleton width={240} height={36} index={1} />
      </VStack>

      <Grid columns={{ minWidth: 320, max: 2, repeat: 'fit' }} gap={4}>
        <Card>
          <VStack gap={3}>
            <Skeleton width={140} height={20} index={2} />
            <Skeleton width={120} height={32} index={3} />
            <Skeleton width="100%" height={8} index={4} />
            <Skeleton width="80%" height={14} index={5} />
          </VStack>
        </Card>
        <Card>
          <VStack gap={3}>
            <Skeleton width={100} height={20} index={6} />
            <Skeleton width="100%" height={40} index={7} />
            <Skeleton width="100%" height={80} index={8} />
          </VStack>
        </Card>
      </Grid>

      <Card>
        <VStack gap={3}>
          <Skeleton width={160} height={20} index={9} />
          <SkeletonTableRows rows={5} />
        </VStack>
      </Card>
    </VStack>
  )
}

export function WorkoutSkeleton() {
  return (
    <VStack as="main" gap={4} aria-busy="true" aria-label="Loading workout">
      <HStack hAlign="between" vAlign="center" gap={2} wrap="wrap">
        <Skeleton width={120} height={28} index={0} />
        <Skeleton width={160} height={32} index={1} />
      </HStack>
      <Skeleton width={240} height={36} index={2} />

      <Card>
        <VStack gap={3}>
          <Skeleton width={180} height={20} index={3} />
          <Skeleton width="80%" height={14} index={4} />
          <HStack gap={2} wrap="wrap">
            <Skeleton width={120} height={36} index={5} />
            <Skeleton width={140} height={36} index={6} />
          </HStack>
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <Skeleton width={140} height={20} index={7} />
          {Array.from({ length: 6 }, (_, index) => (
            <HStack key={index} gap={2} vAlign="center">
              <Skeleton width="45%" height={14} index={index + 8} />
              <Skeleton width="25%" height={14} index={index + 9} />
              <Skeleton width={60} height={28} index={index + 10} />
            </HStack>
          ))}
        </VStack>
      </Card>
    </VStack>
  )
}

export function ProgressSkeleton() {
  return (
    <VStack as="main" gap={4} aria-busy="true" aria-label="Loading progress">
      <Skeleton width={120} height={28} index={0} />

      <Grid columns={{ minWidth: 200, max: 3 }} gap={4}>
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index}>
            <VStack gap={1}>
              <Skeleton width={120} height={14} index={index + 1} />
              <Skeleton width={80} height={28} index={index + 4} />
            </VStack>
          </Card>
        ))}
      </Grid>

      <Card>
        <VStack gap={3}>
          <Skeleton width={140} height={20} index={7} />
          <Skeleton width="100%" height={180} index={8} />
          <SkeletonTableRows rows={4} />
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <Skeleton width={220} height={20} index={9} />
          <Skeleton width="100%" height={8} index={10} />
          <Skeleton width="100%" height={8} index={11} />
          <Skeleton width="100%" height={8} index={12} />
        </VStack>
      </Card>
    </VStack>
  )
}

export function SettingsSkeleton() {
  return (
    <VStack as="main" gap={4} aria-busy="true" aria-label="Loading settings">
      <Skeleton width={120} height={28} index={0} />
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index}>
          <VStack gap={3}>
            <Skeleton width={100} height={20} index={index + 1} />
            <Skeleton width="100%" height={40} index={index + 4} />
            <Skeleton width="100%" height={40} index={index + 5} />
            <Skeleton width={120} height={36} index={index + 6} />
          </VStack>
        </Card>
      ))}
    </VStack>
  )
}

export function RoutePageSkeleton() {
  return (
    <VStack as="main" gap={4} aria-busy="true" aria-label="Loading page">
      <Skeleton width={200} height={28} index={0} />
      <Card>
        <VStack gap={3}>
          <Skeleton width="100%" height={40} index={1} />
          <SkeletonTableRows rows={5} />
        </VStack>
      </Card>
    </VStack>
  )
}
