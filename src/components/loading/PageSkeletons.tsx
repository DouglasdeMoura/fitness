import { Card, Grid, HStack, Skeleton, VStack } from "@astryxdesign/core";

function SkeletonTableRows({ rows = 4 }: { rows?: number }) {
  return (
    <VStack gap={2}>
      {Array.from({ length: rows }, (_, index) => (
        <HStack gap={2} key={index}>
          <Skeleton height={14} index={index} width="30%" />
          <Skeleton height={14} index={index + 1} width="20%" />
          <Skeleton height={14} index={index + 2} width="15%" />
          <Skeleton height={14} index={index + 3} width="15%" />
        </HStack>
      ))}
    </VStack>
  );
}

export function DashboardSkeleton() {
  return (
    <VStack aria-busy="true" aria-label="Loading dashboard" as="main" gap={6}>
      <VStack gap={1}>
        <Skeleton height={28} index={0} width={180} />
        <Skeleton height={14} index={1} width={220} />
      </VStack>

      {/* Calorie ring + hero number card */}
      <Card padding={5}>
        <VStack gap={4} hAlign="center">
          <Skeleton height={180} index={2} radius="rounded" width={180} />
          <Skeleton height={42} index={3} width={100} />
          <Skeleton height={14} index={4} width={140} />
          <Skeleton height={16} index={5} width="70%" />
        </VStack>
      </Card>

      {/* Macro bars card */}
      <Card padding={5}>
        <VStack gap={3}>
          <Skeleton height={14} index={6} width={80} />
          <Skeleton height={8} index={7} width="100%" />
          <Skeleton height={8} index={8} width="100%" />
          <Skeleton height={8} index={9} width="100%" />
        </VStack>
      </Card>

      {/* Secondary stats */}
      <Grid columns={{ max: 3, minWidth: 200 }} gap={4}>
        <Card padding={4}>
          <VStack gap={1}>
            <Skeleton height={14} index={10} width={120} />
            <Skeleton height={28} index={11} width={80} />
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={1}>
            <Skeleton height={14} index={12} width={60} />
            <Skeleton height={28} index={13} width={100} />
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={1}>
            <Skeleton height={14} index={14} width={120} />
            <Skeleton height={28} index={15} width={40} />
          </VStack>
        </Card>
      </Grid>

      {/* Quick Actions skeleton — card-shaped placeholders */}
      <VStack gap={3}>
        <Skeleton height={14} index={16} width={120} />
        <Grid columns={{ max: 2, minWidth: 180 }} gap={4}>
          <Card padding={4}>
            <HStack gap={3} vAlign="center">
              <Skeleton height={32} index={17} radius="rounded" width={32} />
              <VStack gap={1}>
                <Skeleton height={16} index={18} width={100} />
                <Skeleton height={12} index={19} width={140} />
              </VStack>
            </HStack>
          </Card>
          <Card padding={4}>
            <HStack gap={3} vAlign="center">
              <Skeleton height={32} index={20} radius="rounded" width={32} />
              <VStack gap={1}>
                <Skeleton height={16} index={21} width={120} />
                <Skeleton height={12} index={22} width={140} />
              </VStack>
            </HStack>
          </Card>
          <Card padding={4}>
            <HStack gap={3} vAlign="center">
              <Skeleton height={32} index={23} radius="rounded" width={32} />
              <VStack gap={1}>
                <Skeleton height={16} index={24} width={110} />
                <Skeleton height={12} index={25} width={140} />
              </VStack>
            </HStack>
          </Card>
        </Grid>
      </VStack>

      {/* Consistency */}
      <Card padding={4}>
        <VStack gap={3}>
          <Skeleton height={14} index={26} width={120} />
          <VStack gap={2}>
            <Skeleton height={14} index={27} width="100%" />
            <Skeleton height={14} index={28} width="100%" />
            <Skeleton height={14} index={29} width="100%" />
            <Skeleton height={14} index={30} width="100%" />
          </VStack>
          <HStack gap={2} wrap="wrap">
            {Array.from({ length: 7 }).map((_, idx) => (
              <VStack gap={1} hAlign="center" key={idx}>
                <Skeleton
                  height={12}
                  index={31 + idx * 2}
                  radius="rounded"
                  width={12}
                />
                <Skeleton height={10} index={32 + idx * 2} width={28} />
              </VStack>
            ))}
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}

export function NutritionSkeleton() {
  return (
    <VStack aria-busy="true" aria-label="Loading nutrition" as="main" gap={4}>
      <VStack gap={2}>
        <Skeleton height={28} index={0} width={160} />
        <Skeleton height={36} index={1} width={240} />
      </VStack>

      <Grid columns={{ max: 2, minWidth: 320, repeat: "fit" }} gap={4}>
        <Card>
          <VStack gap={3}>
            <Skeleton height={20} index={2} width={140} />
            <Skeleton height={32} index={3} width={120} />
            <Skeleton height={8} index={4} width="100%" />
            <Skeleton height={14} index={5} width="80%" />
          </VStack>
        </Card>
        <Card>
          <VStack gap={3}>
            <Skeleton height={20} index={6} width={100} />
            <Skeleton height={40} index={7} width="100%" />
            <Skeleton height={80} index={8} width="100%" />
          </VStack>
        </Card>
      </Grid>

      <Card>
        <VStack gap={3}>
          <Skeleton height={20} index={9} width={160} />
          <SkeletonTableRows rows={5} />
        </VStack>
      </Card>
    </VStack>
  );
}

export function WorkoutSkeleton() {
  return (
    <VStack aria-busy="true" aria-label="Loading workout" as="main" gap={4}>
      <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
        <Skeleton height={28} index={0} width={120} />
        <Skeleton height={32} index={1} width={160} />
      </HStack>
      <Skeleton height={36} index={2} width={240} />

      <Card>
        <VStack gap={3}>
          <Skeleton height={20} index={3} width={180} />
          <Skeleton height={14} index={4} width="80%" />
          <HStack gap={2} wrap="wrap">
            <Skeleton height={36} index={5} width={120} />
            <Skeleton height={36} index={6} width={140} />
          </HStack>
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <Skeleton height={20} index={7} width={140} />
          {Array.from({ length: 6 }, (_, index) => (
            <HStack gap={2} key={index} vAlign="center">
              <Skeleton height={14} index={index + 8} width="45%" />
              <Skeleton height={14} index={index + 9} width="25%" />
              <Skeleton height={28} index={index + 10} width={60} />
            </HStack>
          ))}
        </VStack>
      </Card>
    </VStack>
  );
}

export function ProgressSkeleton() {
  return (
    <VStack aria-busy="true" aria-label="Loading progress" as="main" gap={4}>
      <Skeleton height={28} index={0} width={120} />

      <Grid columns={{ max: 3, minWidth: 200 }} gap={4}>
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index}>
            <VStack gap={1}>
              <Skeleton height={14} index={index + 1} width={120} />
              <Skeleton height={28} index={index + 4} width={80} />
            </VStack>
          </Card>
        ))}
      </Grid>

      <Card>
        <VStack gap={3}>
          <Skeleton height={20} index={7} width={140} />
          <Skeleton height={180} index={8} width="100%" />
          <SkeletonTableRows rows={4} />
        </VStack>
      </Card>

      <Card>
        <VStack gap={3}>
          <Skeleton height={20} index={9} width={220} />
          <Skeleton height={8} index={10} width="100%" />
          <Skeleton height={8} index={11} width="100%" />
          <Skeleton height={8} index={12} width="100%" />
        </VStack>
      </Card>
    </VStack>
  );
}

export function SettingsSkeleton() {
  return (
    <VStack aria-busy="true" aria-label="Loading settings" as="main" gap={4}>
      <Skeleton height={28} index={0} width={120} />
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index}>
          <VStack gap={3}>
            <Skeleton height={20} index={index + 1} width={100} />
            <Skeleton height={40} index={index + 4} width="100%" />
            <Skeleton height={40} index={index + 5} width="100%" />
            <Skeleton height={36} index={index + 6} width={120} />
          </VStack>
        </Card>
      ))}
    </VStack>
  );
}

export function ReviewSkeleton() {
  return (
    <VStack
      aria-busy="true"
      aria-label="Loading weekly review"
      as="main"
      gap={4}
    >
      <Skeleton height={32} width="60%" />
      <Card>
        <VStack gap={2}>
          <Skeleton height={20} width="30%" />
          <Skeleton height={48} width="100%" />
        </VStack>
      </Card>
      <Grid columns={{ minWidth: 280 }} gap={4}>
        <Card>
          <VStack gap={2}>
            <Skeleton height={24} width="40%" />
            <Skeleton height={80} width="100%" />
          </VStack>
        </Card>
        <Card>
          <VStack gap={2}>
            <Skeleton height={24} width="40%" />
            <Skeleton height={80} width="100%" />
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}

export function RoutePageSkeleton() {
  return (
    <VStack aria-busy="true" aria-label="Loading page" as="main" gap={4}>
      <Skeleton height={28} index={0} width={200} />
      <Card>
        <VStack gap={3}>
          <Skeleton height={40} index={1} width="100%" />
          <SkeletonTableRows rows={5} />
        </VStack>
      </Card>
    </VStack>
  );
}
